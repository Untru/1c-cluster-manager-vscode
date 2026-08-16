import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

test("stdio MCP protocol exposes the cluster management tools", async () => {
  const client = new Client({ name: "onec-cluster-manager-test", version: "0.1.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, "index.js")], stderr: "pipe" });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "clusters_list", "connections_list", "infobase_controls_set", "infobase_get", "infobase_register",
      "infobase_unregister", "infobases_list", "locks_list", "session_terminate", "sessions_list",
    ]);
  } finally {
    await client.close();
  }
});
