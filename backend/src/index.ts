import path from "node:path";
import { ConfigRepository } from "./config";
import { RacClient } from "./rac/client";
import { createBackendServer } from "./server";

const host = process.env.ONEC_CLUSTER_MANAGER_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.ONEC_CLUSTER_MANAGER_PORT ?? "32145", 10);
const configPath = process.env.ONEC_CLUSTER_MANAGER_CONFIG_FILE ?? path.resolve(process.cwd(), ".onec-cluster-manager", "connections.json");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("ONEC_CLUSTER_MANAGER_PORT must be an integer between 1 and 65535");
}

const server = createBackendServer({
  repository: new ConfigRepository(configPath),
  rac: new RacClient(),
  token: process.env.ONEC_CLUSTER_MANAGER_API_TOKEN,
});

server.listen(port, host, () => {
  process.stdout.write(`1C cluster backend listening on http://${host}:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

