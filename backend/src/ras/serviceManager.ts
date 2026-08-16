import { spawn } from "node:child_process";
import { HttpError } from "../errors";
import { discoverRasInstallations } from "./discovery";
import { RasStateRepository } from "./stateRepository";
import type { RasServiceInfo, RasServiceInput, RasServiceRecord } from "./types";
import { normalizeStartInput, rasArguments, validateServiceName } from "./validation";

function decode(buffer: Buffer): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { return new TextDecoder(process.platform === "win32" ? "ibm866" : "windows-1251").decode(buffer); }
}

interface CommandResult { code: number; output: string }

function runSc(args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("sc.exe", args, { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", (error) => reject(new HttpError(502, `Cannot run Windows Service Controller: ${error.message}`)));
    child.once("close", (code) => resolve({ code: code ?? 1, output: decode(Buffer.concat(chunks)).trim() }));
  });
}

function serviceError(result: CommandResult, operation: string): never {
  if (/FAILED\s+5|ОТКАЗАНО В ДОСТУПЕ|ACCESS IS DENIED/i.test(result.output)) {
    throw new HttpError(403, `${operation} requires administrator privileges`, result.output);
  }
  throw new HttpError(502, `${operation} failed`, result.output);
}

function parseStatus(output: string): RasServiceInfo["status"] {
  if (/RUNNING|РАБОТАЕТ/i.test(output)) return "running";
  if (/STOPPED|ОСТАНОВЛЕН/i.test(output)) return "stopped";
  if (/PENDING|ОЖИДАНИЕ/i.test(output)) return "pending";
  return "unknown";
}

export class RasServiceManager {
  public constructor(private readonly state: RasStateRepository) {}

  public async list(): Promise<RasServiceInfo[]> {
    const records = await this.state.list();
    return Promise.all(records.map(async (record) => ({ ...record, status: await this.status(record.serviceName) })));
  }

  public async install(input: Partial<RasServiceInput>): Promise<RasServiceInfo> {
    this.requireWindows();
    const normalized = normalizeStartInput(input, await discoverRasInstallations());
    const suffix = `${normalized.version.replace(/[^0-9]+/g, "-")}-${normalized.port}`;
    const serviceName = validateServiceName(String(input.serviceName || `OneC-RAS-${suffix}`));
    const displayName = String(input.displayName || `1C RAS ${normalized.version} on port ${normalized.port}`).trim();
    if (!displayName || displayName.length > 200) throw new HttpError(400, "displayName must contain 1-200 characters");
    const startType = input.startType === "demand" ? "demand" : "auto";
    const binaryPath = `"${normalized.rasPath}" ${rasArguments(normalized, true).join(" ")}`;
    const result = await runSc(["create", serviceName, "binPath=", binaryPath, "start=", startType, "DisplayName=", displayName]);
    if (result.code !== 0) serviceError(result, "RAS service installation");
    const record: RasServiceRecord = {
      serviceName,
      displayName,
      startType,
      version: normalized.version,
      installedAt: new Date().toISOString(),
      rasPath: normalized.rasPath,
      port: normalized.port,
      agentHost: normalized.agentHost,
      agentPort: normalized.agentPort,
      ...(normalized.monitorPort === undefined ? {} : { monitorPort: normalized.monitorPort }),
    };
    await this.state.put(record);
    return { ...record, status: await this.status(serviceName) };
  }

  public async start(serviceName: string): Promise<RasServiceInfo> {
    const record = await this.state.get(validateServiceName(serviceName));
    const result = await runSc(["start", record.serviceName]);
    if (result.code !== 0) serviceError(result, "RAS service start");
    return { ...record, status: await this.status(record.serviceName) };
  }

  public async stop(serviceName: string): Promise<RasServiceInfo> {
    const record = await this.state.get(validateServiceName(serviceName));
    const result = await runSc(["stop", record.serviceName]);
    if (result.code !== 0) serviceError(result, "RAS service stop");
    return { ...record, status: await this.status(record.serviceName) };
  }

  public async remove(serviceName: string): Promise<void> {
    const record = await this.state.get(validateServiceName(serviceName));
    const result = await runSc(["delete", record.serviceName]);
    if (result.code !== 0) serviceError(result, "RAS service deletion");
    await this.state.remove(record.serviceName);
  }

  private async status(serviceName: string): Promise<RasServiceInfo["status"]> {
    this.requireWindows();
    const result = await runSc(["query", serviceName]);
    if (result.code !== 0 && /1060|НЕ УСТАНОВЛЕНА|DOES NOT EXIST/i.test(result.output)) return "missing";
    if (result.code !== 0) return "unknown";
    return parseStatus(result.output);
  }

  private requireWindows(): void {
    if (process.platform !== "win32") throw new HttpError(501, "Windows service management is available only on Windows");
  }
}

