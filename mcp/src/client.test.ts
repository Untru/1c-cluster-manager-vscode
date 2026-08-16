import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { BackendClient } from "./client";

test("MCP backend client sends safe registration and unregister requests", async (t) => {
  const calls: { method?: string; url?: string; body?: string }[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    calls.push({ method: request.method, url: request.url, body });
    response.writeHead(200, { "content-type": "application/json" }).end("{}");
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const port = (server.address() as AddressInfo).port;
  const client = new BackendClient({ baseUrl: `http://127.0.0.1:${port}` });
  const connectionId = "11111111-1111-4111-8111-111111111111";
  const clusterId = "22222222-2222-4222-8222-222222222222";
  const infobaseId = "33333333-3333-4333-8333-333333333333";

  await client.registerInfobase(connectionId, clusterId, { name: "codex_e2e", dbms: "PostgreSQL", dbServer: "localhost", dbName: "codex_e2e", locale: "ru_RU", createDatabase: false });
  await client.unregisterInfobase(connectionId, clusterId, infobaseId);

  assert.equal(calls[0]?.method, "POST");
  assert.match(calls[0]?.body ?? "", /"createDatabase":false/);
  assert.equal(calls[1]?.method, "DELETE");
  assert.match(calls[1]?.url ?? "", new RegExp(`${infobaseId}$`));
  assert.ok(!calls.some((call) => call.body?.includes("dropDatabase")));
});
