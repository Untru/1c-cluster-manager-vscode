import path from "node:path";
import { ConfigRepository } from "./config";
import { RacClient } from "./rac/client";
import { createBackendServer } from "./server";

const host = process.env.PUSK_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PUSK_PORT ?? "32145", 10);
const configPath = process.env.PUSK_CONFIG_FILE ?? path.resolve(process.cwd(), ".pusk", "connections.json");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PUSK_PORT must be an integer between 1 and 65535");
}

const server = createBackendServer({
  repository: new ConfigRepository(configPath),
  rac: new RacClient(),
  token: process.env.PUSK_API_TOKEN,
});

server.listen(port, host, () => {
  process.stdout.write(`1C cluster backend listening on http://${host}:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

