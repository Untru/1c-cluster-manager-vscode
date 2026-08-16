import * as vscode from "vscode";
import type { BackendConnection, Credentials, RacResponse, ResourceType } from "./model";
import { SecretRepository } from "./secrets";

export class BackendError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
    public readonly details?: { code?: string },
  ) {
    super(message);
  }
}

type AuthorizationScope = "cluster" | "infobase";

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

  public async clusters(connectionId: string): Promise<RacResponse> {
    return this.request(`/api/connections/${connectionId}/clusters`);
  }

  public async resources(connectionId: string, clusterId: string, resource: ResourceType): Promise<RacResponse> {
    return this.authorized(connectionId, clusterId, "cluster", undefined, (credentials) =>
      this.request(`/api/connections/${connectionId}/clusters/${clusterId}/${resource}`, { credentials }));
  }

  public async infobaseDetails(connectionId: string, clusterId: string, infobaseId: string): Promise<RacResponse> {
    return this.authorized(connectionId, clusterId, "infobase", infobaseId, (credentials) =>
      this.request(`/api/connections/${connectionId}/clusters/${clusterId}/infobases/${infobaseId}`, { credentials }));
  }

  public async createInfobase(connectionId: string, clusterId: string, body: Record<string, unknown>): Promise<RacResponse> {
    return this.authorized(connectionId, clusterId, "cluster", undefined, (credentials) =>
      this.request(`/api/connections/${connectionId}/clusters/${clusterId}/infobases`, {
        method: "POST", body, credentials,
      }));
  }

  public async removeInfobase(connectionId: string, clusterId: string, infobaseId: string): Promise<void> {
    await this.authorized(connectionId, clusterId, "infobase", infobaseId, (credentials) =>
      this.request(`/api/connections/${connectionId}/clusters/${clusterId}/infobases/${infobaseId}`, {
        method: "DELETE", credentials,
      }));
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
    const scope: AuthorizationScope = (resource === "infobases" || resource === "connections") && infobaseId
      ? "infobase"
      : "cluster";
    return this.authorized(connectionId, clusterId, scope, infobaseId, (credentials) =>
      this.request(`/api/connections/${connectionId}/clusters/${clusterId}/${resource}/${targetId}/${action}`, {
        method: "POST", body, credentials,
      }));
  }

  private async authorized<T>(
    connectionId: string,
    clusterId: string,
    scope: AuthorizationScope,
    infobaseId: string | undefined,
    operation: (credentials: { cluster: Credentials; infobase: Credentials }) => Promise<T>,
  ): Promise<T> {
    try {
      return await operation(await this.credentials(connectionId, clusterId, infobaseId));
    } catch (error) {
      if (!(error instanceof BackendError) || error.details?.code !== "RAC_AUTH_REQUIRED") throw error;
      const saved = scope === "infobase" && infobaseId
        ? await this.secrets.getInfobase(connectionId, clusterId, infobaseId)
        : await this.secrets.getCluster(connectionId, clusterId);
      const credentials = await this.promptCredentials(scope, saved.user);
      if (!credentials) throw new BackendError(401, "Ввод учётных данных отменён");
      if (scope === "infobase" && infobaseId) {
        await this.secrets.setInfobase(connectionId, clusterId, infobaseId, credentials);
      } else {
        await this.secrets.setCluster(connectionId, clusterId, credentials);
      }
      return operation(await this.credentials(connectionId, clusterId, infobaseId));
    }
  }

  private async promptCredentials(scope: AuthorizationScope, currentUser?: string): Promise<Credentials | undefined> {
    const owner = scope === "infobase" ? "информационной базы" : "кластера";
    const user = await vscode.window.showInputBox({
      title: `Требуется авторизация администратора ${owner}`,
      prompt: "Логин",
      value: currentUser,
      ignoreFocusOut: true,
      validateInput: (value) => value.trim() ? undefined : "Введите логин",
    });
    if (user === undefined) return undefined;
    const password = await vscode.window.showInputBox({
      title: `Требуется авторизация администратора ${owner}`,
      prompt: "Пароль",
      password: true,
      ignoreFocusOut: true,
    });
    return password === undefined ? undefined : { user: user.trim(), password };
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
    const payload = await response.json() as { error?: string; details?: { code?: string } } & T;
    if (!response.ok) throw new BackendError(response.status, payload.error ?? `Backend returned HTTP ${response.status}`, payload.details);
    return payload;
  }
}
