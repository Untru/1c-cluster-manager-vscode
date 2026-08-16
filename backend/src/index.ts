import path from "node:path";
import { ConfigRepository } from "./config";
import { RacClient } from "./rac/client";
import { RasApplicationManager } from "./ras/applicationManager";
import { RasLifecycle } from "./ras/lifecycle";
import { RasServiceManager } from "./ras/serviceManager";
import { RasStateRepository } from "./ras/stateRepository";
import { createBackendServer } from "./server";

const host = process.env.ONEC_CLUSTER_MANAGER_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.ONEC_CLUSTER_MANAGER_PORT ?? "32145", 10);
const configPath = process.env.ONEC_CLUSTER_MANAGER_CONFIG_FILE ?? path.resolve(process.cwd(), ".onec-cluster-manager", "connections.json");
const rasStatePath = process.env.ONEC_CLUSTER_MANAGER_RAS_STATE_FILE ?? path.join(path.dirname(configPath), "ras-state.json");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("ONEC_CLUSTER_MANAGER_PORT must be an integer between 1 and 65535");
}

const ras = new RasLifecycle(
  new RasApplicationManager(),
  new RasServiceManager(new RasStateRepository(rasStatePath)),
);

const server = createBackendServer({
  repository: new ConfigRepository(configPath),
  rac: new RacClient(),
  ras,
  token: process.env.ONEC_CLUSTER_MANAGER_API_TOKEN,
});

server.listen(port, host, () => {
  process.stdout.write(`1C cluster backend listening on http://${host}:${port}\n`);
});

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  ras.dispose();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, shutdown);
process.on("disconnect", shutdown);
process.on("message", (message) => {
  if (typeof message === "object" && message !== null && (message as { type?: string }).type === "shutdown") shutdown();
});
