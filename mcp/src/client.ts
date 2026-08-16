export interface BackendClientOptions {
  baseUrl: string;
  token?: string;
  clusterUser?: string;
  clusterPassword?: string;
  infobaseUser?: string;
  infobasePassword?: string;
}

export interface RegistrationInput {
  name: string;
  dbms: "MSSQLServer" | "PostgreSQL" | "IBMDB2" | "OracleDatabase";
  dbServer: string;
  dbName: string;
  locale: string;
  description?: string;
  dbUser?: string;
  dbPassword?: string;
  createDatabase?: boolean;
}

export interface InfobaseControls {
  sessionsDeny?: boolean;
  scheduledJobsDeny?: boolean;
  licenseDistribution?: "allow" | "deny";
  deniedMessage?: string;
  permissionCode?: string;
}

export class BackendClient {
  private readonly baseUrl: string;

  public constructor(private readonly options: BackendClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
  }

  public listConnections(): Promise<unknown> { return this.request("/api/connections"); }
  public listClusters(connectionId: string): Promise<unknown> { return this.request(`/api/connections/${encodeURIComponent(connectionId)}/clusters`); }
  public listResource(connectionId: string, clusterId: string, resource: "infobases" | "sessions" | "locks"): Promise<unknown> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/clusters/${encodeURIComponent(clusterId)}/${resource}`);
  }
  public registerInfobase(connectionId: string, clusterId: string, input: RegistrationInput): Promise<unknown> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/clusters/${encodeURIComponent(clusterId)}/infobases`, "POST", input);
  }
  public getInfobase(connectionId: string, clusterId: string, infobaseId: string): Promise<unknown> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/clusters/${encodeURIComponent(clusterId)}/infobases/${encodeURIComponent(infobaseId)}`);
  }
  public updateInfobase(connectionId: string, clusterId: string, infobaseId: string, input: InfobaseControls): Promise<unknown> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/clusters/${encodeURIComponent(clusterId)}/infobases/${encodeURIComponent(infobaseId)}/settings`, "POST", input);
  }
  public unregisterInfobase(connectionId: string, clusterId: string, infobaseId: string): Promise<unknown> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/clusters/${encodeURIComponent(clusterId)}/infobases/${encodeURIComponent(infobaseId)}`, "DELETE");
  }
  public terminateSession(connectionId: string, clusterId: string, sessionId: string, message: string): Promise<unknown> {
    return this.request(`/api/connections/${encodeURIComponent(connectionId)}/clusters/${encodeURIComponent(clusterId)}/sessions/${encodeURIComponent(sessionId)}/terminate`, "POST", { message });
  }

  private async request(path: string, method = "GET", body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.options.token) headers.authorization = `Bearer ${this.options.token}`;
    const encoded = (value: string): string => Buffer.from(value, "utf8").toString("base64");
    if (this.options.clusterUser) headers["x-onec-cluster-manager-cluster-user-b64"] = encoded(this.options.clusterUser);
    if (this.options.clusterPassword) headers["x-onec-cluster-manager-cluster-password-b64"] = encoded(this.options.clusterPassword);
    if (this.options.infobaseUser) headers["x-onec-cluster-manager-infobase-user-b64"] = encoded(this.options.infobaseUser);
    if (this.options.infobasePassword) headers["x-onec-cluster-manager-infobase-password-b64"] = encoded(this.options.infobasePassword);
    const response = await fetch(`${this.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(35_000) });
    const payload = response.status === 204 ? {} : await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? `Backend returned HTTP ${response.status}`);
    return payload;
  }
}
