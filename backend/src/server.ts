import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { ConfigRepository } from "./config";
import { HttpError } from "./errors";
import { RacClient } from "./rac/client";
import type { ConnectionInput, RequestCredentials } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOURCE_COMMANDS: Record<string, string[]> = {
  infobases: ["infobase", "summary", "list"],
  sessions: ["session", "list"],
  connections: ["connection", "list"],
  locks: ["lock", "list"],
  servers: ["server", "list"],
  processes: ["process", "list"],
  managers: ["manager", "list"],
  services: ["service", "list"],
};

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new HttpError(413, "Request body is too large");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

function credentialsFrom(request: IncomingMessage): RequestCredentials {
  const header = (name: string): string | undefined => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const decoded = (name: string): string | undefined => {
    const value = header(name);
    if (!value) return undefined;
    try { return Buffer.from(value, "base64").toString("utf8"); } catch { throw new HttpError(400, `Invalid ${name} header`); }
  };
  return {
    clusterUser: decoded("x-onec-cluster-manager-cluster-user-b64"),
    clusterPassword: decoded("x-onec-cluster-manager-cluster-password-b64"),
    infobaseUser: decoded("x-onec-cluster-manager-infobase-user-b64"),
    infobasePassword: decoded("x-onec-cluster-manager-infobase-password-b64"),
  };
}

function requireUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) throw new HttpError(400, `${label} must be a UUID`);
  return value;
}

function optionalUuidQuery(url: URL, name: string): string[] {
  const value = url.searchParams.get(name);
  return value ? [`--${name}=${requireUuid(value, name)}`] : [];
}

function option(body: Record<string, unknown>, name: string, label = name, maxLength = 255): string {
  const value = String(body[name] ?? "").trim();
  if (!value || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) throw new HttpError(400, `${label} must contain 1-${maxLength} characters without control characters`);
  return value;
}

function secretOption(body: Record<string, unknown>, name: string, maxLength = 255): string {
  const value = String(body[name] ?? "");
  if (!value || value.length > maxLength || /[\u0000\r\n]/.test(value)) throw new HttpError(400, `${name} must contain 1-${maxLength} characters without line breaks`);
  return value;
}

function authorize(request: IncomingMessage, token?: string): void {
  if (!token) return;
  if (request.headers.authorization !== `Bearer ${token}`) {
    throw new HttpError(401, "Backend bearer token is missing or invalid");
  }
}

export interface BackendDependencies {
  repository: Pick<ConfigRepository, "list" | "get" | "add" | "remove">;
  rac: Pick<RacClient, "execute">;
  token?: string;
}

export function createBackendServer(dependencies: BackendDependencies): Server {
  return createServer(async (request, response) => {
    try {
      authorize(request, dependencies.token);
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://localhost");
      const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

      if (method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { status: "ok", version: "0.1.0" });
        return;
      }

      if (segments[0] !== "api") throw new HttpError(404, "Route not found");

      if (segments.length === 2 && segments[1] === "connections") {
        if (method === "GET") {
          sendJson(response, 200, { items: await dependencies.repository.list() });
          return;
        }
        if (method === "POST") {
          const body = await readJson(request);
          const created = await dependencies.repository.add(body as unknown as ConnectionInput);
          sendJson(response, 201, created);
          return;
        }
      }

      const connectionMatch = segments[1] === "connections" && segments[2];
      if (!connectionMatch) throw new HttpError(404, "Route not found");
      const connectionId = requireUuid(segments[2], "connectionId");
      const connection = await dependencies.repository.get(connectionId);

      if (segments.length === 3 && method === "DELETE") {
        await dependencies.repository.remove(connectionId);
        response.writeHead(204).end();
        return;
      }

      if (segments[3] !== "clusters") throw new HttpError(404, "Route not found");
      const credentials = credentialsFrom(request);

      if (segments.length === 4 && method === "GET") {
        sendJson(response, 200, await dependencies.rac.execute(connection, ["cluster", "list"]));
        return;
      }

      const clusterId = requireUuid(segments[4], "clusterId");
      const resource = segments[5];

      if (segments.length === 6 && resource === "infobases" && method === "POST") {
        const body = await readJson(request);
        const dbms = option(body, "dbms");
        if (!["MSSQLServer", "PostgreSQL", "IBMDB2", "OracleDatabase"].includes(dbms)) throw new HttpError(400, "Unsupported dbms");
        const command = [
          "infobase", "create", `--cluster=${clusterId}`,
          `--name=${option(body, "name", "name", 100)}`,
          `--dbms=${dbms}`,
          `--db-server=${option(body, "dbServer", "dbServer")}`,
          `--db-name=${option(body, "dbName", "dbName", 100)}`,
          `--locale=${option(body, "locale", "locale", 50)}`,
        ];
        if (typeof body.description === "string" && body.description.trim()) command.push(`--descr=${option(body, "description", "description", 500)}`);
        if (typeof body.dbUser === "string" && body.dbUser.trim()) command.push(`--db-user=${option(body, "dbUser", "dbUser", 100)}`);
        if (typeof body.dbPassword === "string" && body.dbPassword) command.push(`--db-pwd=${secretOption(body, "dbPassword")}`);
        if (body.createDatabase === true) command.push("--create-database");
        sendJson(response, 201, await dependencies.rac.execute(connection, command, credentials));
        return;
      }

      if (segments.length === 6 && method === "GET" && RESOURCE_COMMANDS[resource]) {
        const filters = [
          ...optionalUuidQuery(url, "infobase"),
          ...optionalUuidQuery(url, "session"),
          ...optionalUuidQuery(url, "connection"),
          ...optionalUuidQuery(url, "process"),
          ...optionalUuidQuery(url, "server"),
        ];
        const command = [...RESOURCE_COMMANDS[resource], `--cluster=${clusterId}`, ...filters];
        sendJson(response, 200, await dependencies.rac.execute(connection, command, credentials, resource === "connections"));
        return;
      }

      const targetId = segments[6] ? requireUuid(segments[6], `${resource}Id`) : undefined;
      const action = segments[7];
      if (method === "GET" && resource === "infobases" && targetId && segments.length === 7) {
        sendJson(response, 200, await dependencies.rac.execute(connection, ["infobase", "info", `--cluster=${clusterId}`, `--infobase=${targetId}`], credentials, true));
        return;
      }
      if (method === "DELETE" && resource === "infobases" && targetId && segments.length === 7) {
        sendJson(response, 200, await dependencies.rac.execute(connection, ["infobase", "drop", `--cluster=${clusterId}`, `--infobase=${targetId}`], credentials, true));
        return;
      }
      if (method === "POST" && targetId && action) {
        const body = await readJson(request);
        let command: string[] | undefined;
        let includeInfobaseCredentials = false;

        if (resource === "sessions" && action === "terminate") {
          command = ["session", "terminate", `--cluster=${clusterId}`, `--session=${targetId}`];
          if (typeof body.message === "string" && body.message) command.push(`--error-message=${body.message}`);
        } else if (resource === "sessions" && action === "interrupt") {
          command = ["session", "interrupt-current-server-call", `--cluster=${clusterId}`, `--session=${targetId}`];
          if (typeof body.message === "string" && body.message) command.push(`--error-message=${body.message}`);
        } else if (resource === "connections" && action === "disconnect") {
          const processId = requireUuid(String(body.processId ?? ""), "processId");
          command = ["connection", "disconnect", `--cluster=${clusterId}`, `--process=${processId}`, `--connection=${targetId}`];
          includeInfobaseCredentials = true;
        } else if (resource === "processes" && action === "turn-off") {
          command = ["process", "turn-off", `--cluster=${clusterId}`, `--process=${targetId}`];
        } else if (resource === "infobases" && action === "settings") {
          command = ["infobase", "update", `--cluster=${clusterId}`, `--infobase=${targetId}`];
          includeInfobaseCredentials = true;
          if (typeof body.sessionsDeny === "boolean") command.push(`--sessions-deny=${body.sessionsDeny ? "on" : "off"}`);
          if (typeof body.scheduledJobsDeny === "boolean") command.push(`--scheduled-jobs-deny=${body.scheduledJobsDeny ? "on" : "off"}`);
          if (body.licenseDistribution === "allow" || body.licenseDistribution === "deny") command.push(`--license-distribution=${body.licenseDistribution}`);
          for (const [bodyName, optionName] of [["deniedMessage", "denied-message"], ["permissionCode", "permission-code"]] as const) {
            const value = body[bodyName];
            if (typeof value === "string" && value) command.push(`--${optionName}=${value}`);
          }
          if (command.length === 4) throw new HttpError(400, "At least one infobase setting must be provided");
        }

        if (command) {
          sendJson(response, 200, await dependencies.rac.execute(connection, command, credentials, includeInfobaseCredentials));
          return;
        }
      }

      throw new HttpError(404, "Route not found");
    } catch (error) {
      const httpError = error instanceof HttpError ? error : new HttpError(500, (error as Error).message);
      sendJson(response, httpError.status, { error: httpError.message, details: httpError.details });
    }
  });
}
