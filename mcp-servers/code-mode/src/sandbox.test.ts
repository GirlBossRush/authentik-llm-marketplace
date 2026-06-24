import { test } from "node:test";
import assert from "node:assert/strict";

import { runInSandbox } from "./sandbox.ts";

const fakeAk = { request: async (m, p) => ({ status: 200, data: { m, p } }) };

test("runs code against ak and returns the value", async () => {
  const { result } = await runInSandbox(
    `const r = await ak.request("GET", "/core/users/"); return r.data;`,
    fakeAk,
    {},
  );
  assert.deepEqual(result, { m: "GET", p: "/core/users/" });
});

test("captures console output", async () => {
  const { logs } = await runInSandbox(`console.log("hello", 42);`, fakeAk, {});
  assert.ok(logs.some((l) => l.includes("hello") && l.includes("42")));
});

test("fetch, require, and process are not available in the sandbox", async () => {
  const { result } = await runInSandbox(
    `return [typeof fetch, typeof require, typeof process];`,
    fakeAk,
    {},
  );
  assert.deepEqual(result, ["undefined", "undefined", "undefined"]);
});

test("propagates errors thrown by the code", async () => {
  await assert.rejects(
    () => runInSandbox(`throw new Error("boom");`, fakeAk, {}),
    /boom/,
  );
});
