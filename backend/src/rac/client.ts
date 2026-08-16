import { spawn } from "node:child_process";
import { HttpError } from "../errors";
import type { ConnectionConfig, RacResult, RequestCredentials } from "../types";
import { discoverRac } from "./discovery";
import { parseRacOutput } from "./parser";
import { parseRacCapabilities, type RacCapabilities } from "./capabilities";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

const AUTHORIZATION_ERROR_PATTERNS = [
  /недостаточно\s+прав/i,
  /аутентификац(?:ия|ии).*не\s+(?:выполнена|пройдена|удалась)/i,
  /authentication\s+(?:failed|required)/i,
  /insufficient\s+(?:permissions|privileges|rights)/i,
  /access\s+denied/i,
];

export function isAuthorizationError(message: string): boolean {
  return AUTHORIZATION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function decode(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // Windows rac writes localized output in the OEM console code page (CP866).
    return new TextDecoder(process.platform === "win32" ? "ibm866" : "windows-1251").decode(buffer);
  }
}

export function credentialArgs(credentials: RequestCredentials, includeInfobase = false): string[] {
  const args: string[] = [];
  if (credentials.clusterUser) args.push(`--cluster-user=${credentials.clusterUser}`);
  if (credentials.clusterPassword) args.push(`--cluster-pwd=${credentials.clusterPassword}`);
  if (includeInfobase && credentials.infobaseUser) args.push(`--infobase-user=${credentials.infobaseUser}`);
  if (includeInfobase && credentials.infobasePassword) args.push(`--infobase-pwd=${credentials.infobasePassword}`);
  return args;
}

export class RacClient {
  private readonly capabilityCache = new Map<string, Promise<RacCapabilities>>();

  public async capabilities(connection: ConnectionConfig): Promise<RacCapabilities> {
    const racPath = await discoverRac(connection.racPath);
    const cached = this.capabilityCache.get(racPath);
    if (cached) return cached;
    const loading = this.run(racPath, ["help"]).then((help) => parseRacCapabilities(racPath, help));
    this.capabilityCache.set(racPath, loading);
    try { return await loading; } catch (error) { this.capabilityCache.delete(racPath); throw error; }
  }

  public async execute(
    connection: ConnectionConfig,
    command: string[],
    credentials: RequestCredentials = {},
    includeInfobaseCredentials = false,
  ): Promise<RacResult> {
    const racPath = await discoverRac(connection.racPath);
    const endpoint = connection.host.includes(":") && !connection.host.startsWith("[")
      ? `[${connection.host}]:${connection.port}`
      : `${connection.host}:${connection.port}`;
    const args = [...command, ...credentialArgs(credentials, includeInfobaseCredentials), endpoint];
    const startedAt = performance.now();
    let output: string;
    try {
      output = await this.run(racPath, args);
    } catch (error) {
      if (error instanceof HttpError && isAuthorizationError(error.message)) {
        throw new HttpError(401, error.message, { code: "RAC_AUTH_REQUIRED" });
      }
      throw error;
    }
    return { records: parseRacOutput(output), elapsedMs: Math.round(performance.now() - startedAt) };
  }

  private run(executable: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputSize = 0;
      let settled = false;

      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };
      const collect = (target: Buffer[]) => (chunk: Buffer): void => {
        outputSize += chunk.length;
        if (outputSize > MAX_OUTPUT_BYTES) {
          child.kill();
          finish(() => reject(new HttpError(502, "rac output exceeded the 10 MiB safety limit")));
          return;
        }
        target.push(chunk);
      };

      child.stdout.on("data", collect(stdout));
      child.stderr.on("data", collect(stderr));
      child.on("error", (error) => finish(() => reject(new HttpError(502, `Cannot start rac: ${error.message}`))));
      child.on("close", (code) => finish(() => {
        const errorText = decode(Buffer.concat(stderr)).trim();
        if (code !== 0) {
          reject(new HttpError(502, errorText || `rac exited with code ${code ?? "unknown"}`));
          return;
        }
        resolve(decode(Buffer.concat(stdout)));
      }));

      const timer = setTimeout(() => {
        child.kill();
        finish(() => reject(new HttpError(504, `rac did not respond within ${DEFAULT_TIMEOUT_MS / 1000} seconds`)));
      }, DEFAULT_TIMEOUT_MS);
    });
  }
}
