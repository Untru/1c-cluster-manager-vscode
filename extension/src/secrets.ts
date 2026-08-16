import * as vscode from "vscode";
import type { Credentials } from "./model";

export class SecretRepository {
  public constructor(private readonly storage: vscode.SecretStorage) {}

  public async getCluster(connectionId: string, clusterId: string): Promise<Credentials> {
    return this.get(`cluster.${connectionId}.${clusterId}`);
  }

  public async setCluster(connectionId: string, clusterId: string, credentials: Credentials): Promise<void> {
    await this.set(`cluster.${connectionId}.${clusterId}`, credentials);
  }

  public async getInfobase(connectionId: string, clusterId: string, infobaseId: string): Promise<Credentials> {
    return this.get(`infobase.${connectionId}.${clusterId}.${infobaseId}`);
  }

  public async setInfobase(connectionId: string, clusterId: string, infobaseId: string, credentials: Credentials): Promise<void> {
    await this.set(`infobase.${connectionId}.${clusterId}.${infobaseId}`, credentials);
  }

  public async getBackendToken(): Promise<string | undefined> {
    return this.storage.get("backend.token");
  }

  public async setBackendToken(token: string): Promise<void> {
    await this.storage.store("backend.token", token);
  }

  private async get(key: string): Promise<Credentials> {
    const value = await this.storage.get(key);
    if (!value) return {};
    try { return JSON.parse(value) as Credentials; } catch { return {}; }
  }

  private async set(key: string, credentials: Credentials): Promise<void> {
    await this.storage.store(key, JSON.stringify(credentials));
  }
}

