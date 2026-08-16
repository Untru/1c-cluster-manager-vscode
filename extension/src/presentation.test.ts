import assert from "node:assert/strict";
import test from "node:test";
import { recordDescription, recordId, recordLabel, resourceLabel } from "./presentation";

test("presents core rac records", () => {
  assert.equal(resourceLabel("infobases"), "Информационные базы");
  assert.equal(recordId("infobases", { infobase: "id", name: "Бухгалтерия" }), "id");
  assert.equal(recordLabel("sessions", { "user-name": "Иван", "app-id": "1CV8C" }), "Иван · 1CV8C");
  assert.equal(recordDescription("servers", { "agent-host": "srv", "agent-port": "1540" }), "srv:1540");
});

