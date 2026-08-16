import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "./errors";
import type { ConnectionConfig, ConnectionInput } from "./types";

interface StoredConfig {
  version: 1;
  connections: ConnectionConfig[];
}

const HOST_PATTERN = /^[\p{L}\p{N}._:[\]-]+$/u;

export function validateConnectionInput(input: ConnectionInput): Omit<ConnectionConfig, "id"> {
  const name = String(input.name ?? "").trim();
  const host = String(input.host ?? "").trim();
  const port = input.port ?? 1545;
  const racPath = input.racPath?.trim() || undefined;

  if (!name || name.length > 100) {
    throw new HttpError(400, "Connection name must contain 1-100 characters");
  }
  if (!host || host.length > 255 || !HOST_PATTERN.test(host)) {
    throw new HttpError(400, "Invalid RAS host name");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new HttpError(400, "RAS port must be an integer between 1 and 65535");
  }
  if (racPath && !/rac(?:\.exe)?$/i.test(path.basename(racPath))) {
    throw new HttpError(400, "racPath must point to rac or rac.exe");
  }

  return { name, host, port, racPath };
}

export class ConfigRepository {
  public constructor(private readonly filePath: string) {}

  public async list(): Promise<ConnectionConfig[]> {
    return (await this.read()).connections;
  }

  public async get(id: string): Promise<ConnectionConfig> {
    const item = (await this.read()).connections.find((connection) => connection.id === id);
    if (!item) {
      throw new HttpError(404, `Connection '${id}' was not found`);
    }
    return item;
  }

  public async add(input: ConnectionInput): Promise<ConnectionConfig> {
    const value: ConnectionConfig = { id: randomUUID(), ...validateConnectionInput(input) };
    const config = await this.read();
    config.connections.push(value);
    await this.write(config);
    return value;
  }

  public async remove(id: string): Promise<void> {
    const config = await this.read();
    const next = config.connections.filter((connection) => connection.id !== id);
    if (next.length === config.connections.length) {
      throw new HttpError(404, `Connection '${id}' was not found`);
    }
    config.connections = next;
    await this.write(config);
  }

  private async read(): Promise<StoredConfig> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<StoredConfig>;
      if (parsed.version !== 1 || !Array.isArray(parsed.connections)) {
        throw new Error("unsupported configuration format");
      }
      return { version: 1, connections: parsed.connections };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, connections: [] };
      }
      throw new HttpError(500, `Cannot read backend configuration: ${(error as Error).message}`);
    }
  }

  private async write(config: StoredConfig): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}

