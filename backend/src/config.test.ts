import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "./errors";
import { validateConnectionInput } from "./config";

test("normalizes a valid connection", () => {
  assert.deepEqual(validateConnectionInput({ name: " Local ", host: "localhost" }), {
    name: "Local",
    host: "localhost",
    port: 1545,
    racPath: undefined,
  });
});

test("rejects unsafe host and port values", () => {
  assert.throws(() => validateConnectionInput({ name: "x", host: "localhost & calc" }), HttpError);
  assert.throws(() => validateConnectionInput({ name: "x", host: "localhost", port: 70000 }), HttpError);
});

