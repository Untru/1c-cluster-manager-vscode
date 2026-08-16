import * as vscode from "vscode";
import type { BackendConnection, Credentials, RacResponse, RasApplicationInfo, RasInstallation, RasServiceInfo, RasStartInput, ResourceType } from "./model";
import { SecretRepository } from "./secrets";

export class BackendError extends Error {
  public constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export class ApiClient {
  public constructor(private readonly secrets: SecretRepository) {}

  public async health(): Promise<void> {
    const response = await this.request<{ status: string }>("/health");
    if (response.status !== "ok") throw new BackendError(502, "Unexpected service responded at the backend URL");
  }

  public async listConnections(): Promise<BackendConnection[]> {
    const response = await this.request<{ items: BackendConnection[] }>("/api/connections");
    return response.items;
  }

  public addConnection(input: Omit<BackendConnection, "id">): Promise<BackendConnection> {
    return this.request("/api/connections", { method: "POST", body: input });
  }

  public async removeConnection(id: string): Promise<void> {
    await this.request(`/api/connections/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  public async rasInstallations(): Promise<RasInstallation[]> {
    return (await this.request<{ items: RasInstallation[] }>("/api/ras/installations")).items;
  }

  public async rasApplications(): Promise<RasApplicationInfo[]> {
    return (await this.request<{ items: RasApplicationInfo[] }>("/api/ras/applications")).items;
  }

  public startRasApplication(input: RasStartInput): Promise<RasApplicationInfo> {
    return this.request("/api/ras/applications", { method: "POST", body: input });
  }

  public async stopRasApplication(id: string): Promise<void> {
    await this.request(`/api/ras/applications/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  public async rasServices(): Promise<RasServiceInfo[]> {
    return (await this.request<{ items: RasServiceInfo[] }>("/api/ras/services")).items;
  }

  public installRasService(input: RasStartInput & { serviceName?: string; displayName?: string; startType?: "auto" | "demand" }): Promise<RasServiceInfo> {
    return this.request("/api/ras/services", { method: "POST", body: input });
  }

  public rasServiceAction(name: string, action: "start" | "stop"): Promise<RasServiceInfo> {
    return this.request(`/api/ras/services/${encodeURIComponent(name)}/${action}`, { method: "POST" });
  }

  public async removeRasService(name: string): Promise<void> {
    await this.request(`/api/ras/services/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  public async clusters(connectionId: string): Promise<RacResponse> {
    return this.request(`/api/connections/${connectionId}/clusters`);
  }

  public async resources(connectionId: string, clusterId: string, resource: ResourceType): Promise<RacResponse> {
    return this.request(`/api/connections/${connectionId}/clusters/${clusterId}/${resource}`, {
      credentials: await this.credentials(connectionId, clusterId),
    });
  }

  public async action(
    connectionId: string,
    clusterId: string,
    resource: ResourceType,
    targetId: string,
    action: string,
    body: Record<string, unknown> = {},
    infobaseId?: string,
  ): Promise<RacResponse> {
    return this.request(`/api/connections/${connectionId}/clusters/${clusterId}/${resource}/${targetId}/${action}`, {
      method: "POST",
      body,
      credentials: await this.credentials(connectionId, clusterId, infobaseId),
    });
  }

  private async credentials(connectionId: string, clusterId: string, infobaseId?: string): Promise<{ cluster: Credentials; infobase: Credentials }> {
    return {
      cluster: await this.secrets.getCluster(connectionId, clusterId),
      infobase: infobaseId ? await this.secrets.getInfobase(connectionId, clusterId, infobaseId) : {},
    };
  }

  private async request<T = unknown>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      credentials?: { cluster: Credentials; infobase: Credentials };
    } = {},
  ): Promise<T> {
    const baseUrl = vscode.workspace.getConfiguration("onecClusterManager").get<string>("backend.url", "http://127.0.0.1:32145").replace(/\/$/, "");
    const headers: Record<string, string> = { accept: "application/json" };
    const token = await this.secrets.getBackendToken();
    if (token) headers.authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers["content-type"] = "application/json";
    const encoded = (value: string): string => Buffer.from(value, "utf8").toString("base64");
    if (options.credentials?.cluster.user) headers["x-onec-cluster-manager-cluster-user-b64"] = encoded(options.credentials.cluster.user);
    if (options.credentials?.cluster.password) headers["x-onec-cluster-manager-cluster-password-b64"] = encoded(options.credentials.cluster.password);
    if (options.credentials?.infobase.user) headers["x-onec-cluster-manager-infobase-user-b64"] = encoded(options.credentials.infobase.user);
    if (options.credentials?.infobase.password) headers["x-onec-cluster-manager-infobase-password-b64"] = encoded(options.credentials.infobase.password);

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(35_000),
    });
    if (response.status === 204) return undefined as T;
    const payload = await response.json() as { error?: string } & T;
    if (!response.ok) throw new BackendError(response.status, payload.error ?? `Backend returned HTTP ${response.status}`);
    return payload;
  }
}
