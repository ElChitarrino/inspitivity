import assert from "node:assert/strict";
import test from "node:test";
import { isTheme, resolveInitialTheme } from "../packages/theme/index.js";

test("only supported theme values are accepted", () => {
  assert.equal(isTheme("electric"), true);
  assert.equal(isTheme("crimson"), true);
  assert.equal(isTheme("green"), false);
  assert.equal(isTheme(null), false);
});

test("a valid saved theme always wins", () => {
  assert.equal(resolveInitialTheme("crimson", true), "crimson");
  assert.equal(resolveInitialTheme("electric", false), "electric");
});

test("existing devices retain Electric Green and clean devices start Crimson", () => {
  assert.equal(resolveInitialTheme(null, true), "electric");
  assert.equal(resolveInitialTheme("invalid", true), "electric");
  assert.equal(resolveInitialTheme(null, false), "crimson");
});
