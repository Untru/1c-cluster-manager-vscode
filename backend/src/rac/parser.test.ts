import assert from "node:assert/strict";
import test from "node:test";
import { parseRacOutput } from "./parser";

test("parses multiple rac records and quoted values", () => {
  const output = [
    "cluster : a497404c-ded5-424b-890b-b81766b0521c",
    "name    : \"Локальный кластер\"",
    "port    : 1541",
    "",
    "cluster : 24c580ef-d5de-4b78-b204-b94b64eb2fae",
    "name    : \"Второй кластер\"",
    "",
  ].join("\r\n");

  assert.deepEqual(parseRacOutput(output), [
    { cluster: "a497404c-ded5-424b-890b-b81766b0521c", name: "Локальный кластер", port: "1541" },
    { cluster: "24c580ef-d5de-4b78-b204-b94b64eb2fae", name: "Второй кластер" },
  ]);
});

test("keeps empty values and continuation lines", () => {
  assert.deepEqual(parseRacOutput("name : test\nrestart-schedule : \n  every day\n"), [
    { name: "test", "restart-schedule": "\nevery day" },
  ]);
});

