export interface BackendConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  racPath?: string;
}

export type RacRecord = Record<string, string>;

export interface RacResponse {
  records: RacRecord[];
  elapsedMs: number;
}

export interface Credentials {
  user?: string;
  password?: string;
}

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

export interface RasServiceInfo extends RasStartInput {
  serviceName: string;
  displayName: string;
  startType: "auto" | "demand";
  version: string;
  installedAt: string;
  status: "running" | "stopped" | "pending" | "missing" | "unknown";
}

export const RESOURCE_TYPES = [
  "infobases",
  "sessions",
  "connections",
  "locks",
  "servers",
  "processes",
  "managers",
  "services",
] as const;

export type ResourceType = typeof RESOURCE_TYPES[number];
