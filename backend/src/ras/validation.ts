import path from "node:path";
import { HttpError } from "../errors";
import type { RasInstallation, RasStartInput } from "./types";

const HOST_PATTERN = /^[\p{L}\p{N}._:[\]-]+$/u;
const SERVICE_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

export function validatePort(value: unknown, label: string): number {
  const port = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError(400, `${label} must be an integer between 1 and 65535`);
  return port;
}

export function validateHost(value: unknown, label = "agentHost"): string {
  const host = String(value ?? "").trim();
  if (!host || host.length > 255 || !HOST_PATTERN.test(host)) throw new HttpError(400, `${label} is invalid`);
  return host;
}

export function validateServiceName(value: string): string {
  if (!SERVICE_PATTERN.test(value)) throw new HttpError(400, "serviceName may contain only letters, numbers, dots, dashes and underscores");
  return value;
}

export function normalizeStartInput(input: Partial<RasStartInput>, installations: RasInstallation[]): RasStartInput & { version: string } {
  const rasPath = String(input.rasPath ?? "").trim();
  const installation = installations.find((item) => path.normalize(item.path).toLowerCase() === path.normalize(rasPath).toLowerCase());
  if (!installation) throw new HttpError(400, "rasPath must reference one of the discovered RAS installations");
  const normalized: RasStartInput & { version: string } = {
    rasPath: installation.path,
    version: installation.version,
    port: validatePort(input.port, "port"),
    agentHost: validateHost(input.agentHost),
    agentPort: validatePort(input.agentPort, "agentPort"),
  };
  if (input.monitorPort !== undefined) normalized.monitorPort = validatePort(input.monitorPort, "monitorPort");
  if (normalized.port === normalized.monitorPort) throw new HttpError(400, "port and monitorPort must be different");
  return normalized;
}

export function rasArguments(input: RasStartInput, asService = false): string[] {
  const args = ["cluster"];
  if (asService) args.push("--service");
  args.push(`--port=${input.port}`);
  if (input.monitorPort !== undefined) args.push(`--monitor-port=${input.monitorPort}`);
  const host = input.agentHost.includes(":") && !input.agentHost.startsWith("[") ? `[${input.agentHost}]` : input.agentHost;
  args.push(`${host}:${input.agentPort}`);
  return args;
}

