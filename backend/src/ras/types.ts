export interface RasInstallation {
  path: string;
  version: string;
}

export interface RasStartInput {
  rasPath: string;
  port: number;
  agentHost: string;
  agentPort: number;
  monitorPort?: number;
}

export interface RasApplicationInfo extends RasStartInput {
  id: string;
  pid: number;
  version: string;
  startedAt: string;
}

export interface RasServiceInput extends RasStartInput {
  serviceName?: string;
  displayName?: string;
  startType?: "auto" | "demand";
}

export interface RasServiceRecord extends Required<Pick<RasServiceInput, "serviceName" | "displayName" | "startType">>, RasStartInput {
  version: string;
  installedAt: string;
}

export interface RasServiceInfo extends RasServiceRecord {
  status: "running" | "stopped" | "pending" | "missing" | "unknown";
}

