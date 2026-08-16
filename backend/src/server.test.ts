import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { ConnectionConfig, ConnectionInput, RacResult, RequestCredentials } from "./types";
import { createBackendServer } from "./server";

function fixture(token?: string) {
  const connection: ConnectionConfig = { id: "11111111-1111-4111-8111-111111111111", name: "Local", host: "localhost", port: 1545 };
  const commands: string[][] = [];
  const server = createBackendServer({
    token,
    repository: {
      list: async () => [connection],
      get: async () => connection,
      add: async (input: ConnectionInput) => ({ ...connection, ...input }),
      remove: async () => undefined,
    },
    rac: {
      execute: async (_connection: ConnectionConfig, command: string[], _credentials?: RequestCredentials): Promise<RacResult> => {
        commands.push(command);
        return { records: [{ cluster: "22222222-2222-4222-8222-222222222222", name: "Test" }], elapsedMs: 1 };
      },
    },
  });
  return { server, commands, connection };
}

test("serves connections and translates a cluster resource request", async (t) => {
  const { server, commands, connection } = fixture();
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const port = (server.address() as AddressInfo).port;

  const listed = await fetch(`http://127.0.0.1:${port}/api/connections`).then((response) => response.json()) as { items: ConnectionConfig[] };
  assert.equal(listed.items[0]?.name, "Local");

  const clusterId = "22222222-2222-4222-8222-222222222222";
  const response = await fetch(`http://127.0.0.1:${port}/api/connections/${connection.id}/clusters/${clusterId}/sessions`);
  assert.equal(response.status, 200);
  assert.deepEqual(commands[0], ["session", "list", `--cluster=${clusterId}`]);
});

test("requires configured bearer token", async (t) => {
  const { server } = fixture("secret");
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const port = (server.address() as AddressInfo).port;

  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`, { headers: { authorization: "Bearer secret" } })).status, 200);
});

test("translates safe infobase registration lifecycle without dropping a database", async (t) => {
  const { server, commands, connection } = fixture();
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const port = (server.address() as AddressInfo).port;
  const clusterId = "22222222-2222-4222-8222-222222222222";
  const infobaseId = "33333333-3333-4333-8333-333333333333";
  const root = `http://127.0.0.1:${port}/api/connections/${connection.id}/clusters/${clusterId}`;

  assert.equal((await fetch(`${root}/infobases`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "codex_e2e", dbms: "PostgreSQL", dbServer: "localhost", dbName: "codex_e2e", locale: "ru_RU", description: "E2E" }) })).status, 201);
  assert.equal((await fetch(`${root}/infobases/${infobaseId}/settings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    description: "Обновлено из VS Code",
    dbServer: "db.local",
    dbName: "onec_test",
    dbUser: "onec",
    sessionsDeny: true,
    scheduledJobsDeny: true,
    licenseDistribution: "deny",
    deniedMessage: "Технические работы",
    permissionCode: "service",
    externalSessionManagerRequired: false,
    securityLevel: "1",
  }) })).status, 200);
  assert.equal((await fetch(`${root}/infobases/${infobaseId}`)).status, 200);
  assert.equal((await fetch(`${root}/infobases/${infobaseId}`, { method: "DELETE" })).status, 200);

  assert.deepEqual(commands[0], ["infobase", "create", `--cluster=${clusterId}`, "--name=codex_e2e", "--dbms=PostgreSQL", "--db-server=localhost", "--db-name=codex_e2e", "--locale=ru_RU", "--descr=E2E"]);
  assert.ok(commands[1]?.includes("--license-distribution=deny"));
  assert.ok(commands[1]?.includes("--descr=Обновлено из VS Code"));
  assert.ok(commands[1]?.includes("--db-server=db.local"));
  assert.ok(commands[1]?.includes("--denied-message=Технические работы"));
  assert.ok(commands[1]?.includes("--external-session-manager-required=no"));
  assert.deepEqual(commands[2], ["infobase", "info", `--cluster=${clusterId}`, `--infobase=${infobaseId}`]);
  assert.deepEqual(commands[3], ["infobase", "drop", `--cluster=${clusterId}`, `--infobase=${infobaseId}`]);
  assert.ok(!commands.flat().includes("--drop-database"));
});

