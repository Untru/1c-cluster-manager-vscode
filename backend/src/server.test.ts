import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { ConnectionConfig, ConnectionInput, RacResult, RequestCredentials } from "./types";
import { createBackendServer } from "./server";

function fixture(token?: string) {
  const connection: ConnectionConfig = { id: "11111111-1111-4111-8111-111111111111", name: "Local", host: "localhost", port: 1545 };
  const commands: string[][] = [];
  const rasCalls: string[] = [];
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
    ras: {
      installations: async () => [{ path: "C:\\1cv8\\bin\\ras.exe", version: "8.3.27.2214" }],
      listApplications: async () => [],
      startApplication: async (input) => { rasCalls.push("startApplication"); return { ...input, rasPath: String(input.rasPath), port: Number(input.port), agentHost: String(input.agentHost), agentPort: Number(input.agentPort), id: "33333333-3333-4333-8333-333333333333", pid: 42, version: "8.3.27.2214", startedAt: "2026-08-16T00:00:00.000Z" }; },
      stopApplication: async () => { rasCalls.push("stopApplication"); },
      listServices: async () => [],
      installService: async () => { throw new Error("not used"); },
      startService: async () => { throw new Error("not used"); },
      stopService: async () => { throw new Error("not used"); },
      removeService: async () => { throw new Error("not used"); },
    },
  });
  return { server, commands, rasCalls, connection };
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

test("serves RAS installations and managed application lifecycle", async (t) => {
  const { server, rasCalls } = fixture();
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const port = (server.address() as AddressInfo).port;

  const installations = await fetch(`http://127.0.0.1:${port}/api/ras/installations`).then((response) => response.json()) as { items: { version: string }[] };
  assert.equal(installations.items[0]?.version, "8.3.27.2214");

  const created = await fetch(`http://127.0.0.1:${port}/api/ras/applications`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rasPath: "C:\\1cv8\\bin\\ras.exe", port: 4545, agentHost: "localhost", agentPort: 2540 }),
  });
  assert.equal(created.status, 201);
  const id = ((await created.json()) as { id: string }).id;
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/ras/applications/${id}`, { method: "DELETE" })).status, 204);
  assert.deepEqual(rasCalls, ["startApplication", "stopApplication"]);
});
