import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "../errors";
import type { RasServiceRecord } from "./types";

interface StateFile { version: 1; services: RasServiceRecord[] }

export class RasStateRepository {
  public constructor(private readonly filePath: string) {}

  public async list(): Promise<RasServiceRecord[]> { return (await this.read()).services; }

  public async put(record: RasServiceRecord): Promise<void> {
    const state = await this.read();
    state.services = [...state.services.filter((item) => item.serviceName !== record.serviceName), record];
    await this.write(state);
  }

  public async remove(serviceName: string): Promise<void> {
    const state = await this.read();
    state.services = state.services.filter((item) => item.serviceName !== serviceName);
    await this.write(state);
  }

  public async get(serviceName: string): Promise<RasServiceRecord> {
    const record = (await this.read()).services.find((item) => item.serviceName === serviceName);
    if (!record) throw new HttpError(404, `RAS service '${serviceName}' is not managed by this backend`);
    return record;
  }

  private async read(): Promise<StateFile> {
    try {
      const value = JSON.parse(await readFile(this.filePath, "utf8")) as StateFile;
      if (value.version !== 1 || !Array.isArray(value.services)) throw new Error("unsupported state format");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, services: [] };
      throw new HttpError(500, `Cannot read RAS state: ${(error as Error).message}`);
    }
  }

  private async write(state: StateFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}

