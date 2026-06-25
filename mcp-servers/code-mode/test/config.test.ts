import { test } from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "#config";

test("loadConfig reads and normalizes env", () => {
    const cfg = loadConfig({
        AUTHENTIK_URL: "https://id.example.com/",
        AUTHENTIK_TOKEN: "ak-tok",
    });
    assert.equal(cfg.baseURL, "https://id.example.com");
    assert.equal(cfg.token, "ak-tok");
});

test("loadConfig throws when token missing", () => {
    assert.throws(
        () => loadConfig({ AUTHENTIK_URL: "https://id.example.com" }),
        /AUTHENTIK_TOKEN/,
    );
});

test("loadConfig defaults AUTHENTIK_URL to localhost:9000 when unset", () => {
    const cfg = loadConfig({ AUTHENTIK_TOKEN: "t" });
    assert.equal(cfg.baseURL, "http://localhost:9000");
    assert.equal(cfg.token, "t");
});

test("loadConfig still requires a token", () => {
    assert.throws(
        () => loadConfig({ AUTHENTIK_URL: "http://localhost:9000" }),
        /AUTHENTIK_TOKEN/,
    );
});
