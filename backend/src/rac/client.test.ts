import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizationError } from "./client";

test("recognizes localized rac authorization errors", () => {
  assert.equal(isAuthorizationError("Недостаточно прав пользователя на информационную базу"), true);
  assert.equal(isAuthorizationError("Аутентификация не выполнена"), true);
  assert.equal(isAuthorizationError("Insufficient privileges to perform the operation"), true);
});

test("does not classify technical rac errors as authorization errors", () => {
  assert.equal(isAuthorizationError("Соединение с сервером потеряно"), false);
  assert.equal(isAuthorizationError("rac exited with code 1"), false);
});
