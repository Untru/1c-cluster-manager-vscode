export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  racPath?: string;
}

export interface ConnectionInput {
  name: string;
  host: string;
  port?: number;
  racPath?: string;
}

export interface RequestCredentials {
  clusterUser?: string;
  clusterPassword?: string;
  infobaseUser?: string;
  infobasePassword?: string;
}

export type RacRecord = Record<string, string>;

export interface RacResult {
  records: RacRecord[];
  elapsedMs: number;
}

