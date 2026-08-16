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

