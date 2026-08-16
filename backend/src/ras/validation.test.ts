import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStartInput, rasArguments, validateServiceName } from "./validation";

const installation = { path: "C:\\Program Files\\1cv8\\8.3.27.2214\\bin\\ras.exe", version: "8.3.27.2214" };

test("normalizes RAS start input and builds application arguments", () => {
  const input = normalizeStartInput({ rasPath: installation.path, port: 4545, agentHost: "localhost", agentPort: 2540, monitorPort: 4555 }, [installation]);
  assert.deepEqual(rasArguments(input), ["cluster", "--port=4545", "--monitor-port=4555", "localhost:2540"]);
  assert.deepEqual(rasArguments(input, true), ["cluster", "--service", "--port=4545", "--monitor-port=4555", "localhost:2540"]);
});

test("rejects unknown executables and unsafe service names", () => {
  assert.throws(() => normalizeStartInput({ rasPath: "C:\\temp\\ras.exe", port: 4545, agentHost: "localhost", agentPort: 2540 }, [installation]));
  assert.throws(() => validateServiceName("RAS & calc"));
});

