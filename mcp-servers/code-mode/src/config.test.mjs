import { test } from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "./config.mjs";

test("loadConfig reads and normalizes env", () => {
  const cfg = loadConfig({
    AUTHENTIK_URL: "https://id.example.com/",
    AUTHENTIK_TOKEN: "ak-tok",
  });
  assert.equal(cfg.baseUrl, "https://id.example.com");
  assert.equal(cfg.token, "ak-tok");
});

test("loadConfig throws when URL missing", () => {
  assert.throws(() => loadConfig({ AUTHENTIK_TOKEN: "x" }), /AUTHENTIK_URL/);
});

test("loadConfig throws when token missing", () => {
  assert.throws(
    () => loadConfig({ AUTHENTIK_URL: "https://id.example.com" }),
    /AUTHENTIK_TOKEN/,
  );
});
