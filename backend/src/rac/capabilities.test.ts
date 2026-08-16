import assert from "node:assert/strict";
import test from "node:test";
import { parseRacCapabilities } from "./capabilities";

test("parses base and new rac modes without substring collisions", () => {
  const value = parseRacCapabilities("C:\\Program Files\\1cv8\\8.5.1.1150\\bin\\rac.exe", `
    cluster  cluster administration
    service  cluster services
    service-setting service settings
    binary-data-storage storage
  `);
  assert.equal(value.version, "8.5.1.1150");
  assert.deepEqual(value.modes, ["cluster", "service", "service-setting", "binary-data-storage"]);
});

