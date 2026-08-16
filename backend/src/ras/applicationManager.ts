import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, connect } from "node:net";
import { HttpError } from "../errors";
import { discoverRasInstallations } from "./discovery";
import type { RasApplicationInfo, RasStartInput } from "./types";
import { normalizeStartInput, rasArguments } from "./validation";

interface ManagedApplication {
  info: RasApplicationInfo;
  process: ChildProcess;
}

async function assertPortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(new HttpError(409, `TCP port ${port} is already in use`)));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve()));
  });
}

async function waitForPort(port: number, process: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (process.exitCode !== null) throw new HttpError(502, `RAS exited before opening TCP port ${port}`);
    const connected = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: "127.0.0.1", port });
      socket.setTimeout(200);
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("timeout", () => { socket.destroy(); resolve(false); });
      socket.once("error", () => resolve(false));
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new HttpError(504, `RAS did not open TCP port ${port} within 10 seconds`);
}

export class RasApplicationManager {
  private readonly applications = new Map<string, ManagedApplication>();

  public async list(): Promise<RasApplicationInfo[]> {
    return [...this.applications.values()].map((item) => item.info);
  }

  public async start(input: Partial<RasStartInput>): Promise<RasApplicationInfo> {
    const normalized = normalizeStartInput(input, await discoverRasInstallations());
    await assertPortAvailable(normalized.port);
    const child = spawn(normalized.rasPath, rasArguments(normalized), {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const id = randomUUID();
    const info: RasApplicationInfo = {
      id,
      pid: child.pid ?? 0,
      version: normalized.version,
      startedAt: new Date().toISOString(),
      rasPath: normalized.rasPath,
      port: normalized.port,
      agentHost: normalized.agentHost,
      agentPort: normalized.agentPort,
      ...(normalized.monitorPort === undefined ? {} : { monitorPort: normalized.monitorPort }),
    };
    const errorChunks: Buffer[] = [];
    child.stderr?.on("data", (chunk: Buffer) => {
      if (errorChunks.reduce((sum, value) => sum + value.length, 0) < 64 * 1024) errorChunks.push(chunk);
    });
    child.once("exit", () => this.applications.delete(id));
    child.once("error", () => this.applications.delete(id));

    try {
      await waitForPort(normalized.port, child);
    } catch (error) {
      child.kill();
      const details = Buffer.concat(errorChunks).toString("utf8").trim();
      if (details) throw new HttpError((error as HttpError).status ?? 502, `${(error as Error).message}: ${details}`);
      throw error;
    }
    this.applications.set(id, { info, process: child });
    return info;
  }

  public async stop(id: string): Promise<void> {
    const application = this.applications.get(id);
    if (!application) throw new HttpError(404, `Managed RAS application '${id}' was not found`);
    application.process.kill();
    await new Promise<void>((resolve) => {
      if (application.process.exitCode !== null) return resolve();
      const timer = setTimeout(() => resolve(), 5_000);
      application.process.once("exit", () => { clearTimeout(timer); resolve(); });
    });
    this.applications.delete(id);
  }

  public dispose(): void {
    for (const application of this.applications.values()) application.process.kill();
    this.applications.clear();
  }
}

