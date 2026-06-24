import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ENTRY = resolve(__dirname, "index.mjs");

test("server starts, serves schema, and responds to tools/list over stdio", async () => {
    // Mock instance serving a minimal schema.
    const inst = createServer((req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ openapi: "3.0.3", paths: {}, components: {} }));
    });
    await new Promise((r) => inst.listen(0, r));
    const baseUrl = `http://127.0.0.1:${inst.address().port}`;

    const child = spawn("node", [ENTRY], {
        env: { ...process.env, AUTHENTIK_URL: baseUrl, AUTHENTIK_TOKEN: "t" },
        stdio: ["pipe", "pipe", "pipe"],
    });
    try {
        let out = "";
        child.stdout.on("data", (d) => (out += d));
        const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
        send({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
        });
        send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
        await new Promise((r) => setTimeout(r, 1500));
        assert.match(out, /"search"/);
        assert.match(out, /"execute_write"/);
    } finally {
        child.kill();
        inst.close();
    }
});
