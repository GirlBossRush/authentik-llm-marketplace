import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ENTRY = resolve(__dirname, "..", "lib", "index.ts");

test("server starts, serves schema, and responds to tools/list over stdio", async () => {
    // Mock instance serving a minimal schema.
    const inst = createServer((_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(
            JSON.stringify({ openapi: "3.0.3", paths: {}, components: {} }),
        );
    });

    await new Promise<void>((r) => inst.listen(0, () => r()));

    const { port } = inst.address() as AddressInfo;
    const baseURL = `http://127.0.0.1:${port}`;

    const child = spawn("node", [ENTRY], {
        env: { ...process.env, AUTHENTIK_URL: baseURL, AUTHENTIK_TOKEN: "t" },
        stdio: ["pipe", "pipe", "pipe"],
    });

    try {
        let out = "";
        child.stdout?.on("data", (d) => (out += String(d)));

        const send = (msg: object) =>
            child.stdin?.write(JSON.stringify(msg) + "\n");

        send({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2025-06-18",
                capabilities: {},
                clientInfo: { name: "t", version: "0" },
            },
        });

        send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

        await new Promise((r) => setTimeout(r, 1500));

        assert.match(out, /"search"/);
        assert.match(out, /"validate_blueprint"/);
        assert.match(out, /"prepare_apply"/);
        assert.match(out, /"docs"/);
        assert.doesNotMatch(out, /"execute_write"/);

        // The server is propose-only: it must expose NO apply/write tool. Parse
        // the tools/list response and assert no registered tool name matches the
        // write/apply family.
        const listMsg = out
            .split("\n")
            .map((line) => {
                try {
                    return JSON.parse(line) as {
                        id?: number;
                        result?: { tools?: Array<{ name: string }> };
                    };
                } catch {
                    return null;
                }
            })
            .find((msg) => msg?.id === 2 && msg.result?.tools);
        assert.ok(listMsg, "tools/list response not found");
        const toolNames = (listMsg.result?.tools ?? []).map((t) => t.name);
        assert.ok(toolNames.includes("prepare_apply"));
        for (const name of toolNames) {
            assert.doesNotMatch(
                name,
                /execute_write|apply_write|^write/,
                `unexpected apply/write tool: ${name}`,
            );
        }
    } finally {
        child.kill();
        inst.close();
    }
});

test("server constructs its ak read-only: no write/apply token env is consumed", async () => {
    // The MCP never holds an apply credential. The server reads only
    // AUTHENTIK_URL / AUTHENTIK_TOKEN; any write/apply-specific token env must be
    // ignored. We start the server WITHOUT such env and assert it still comes up
    // healthy (its single token is used read-only by createAk(allowWrites:false)).
    const inst = createServer((_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(
            JSON.stringify({ openapi: "3.0.3", paths: {}, components: {} }),
        );
    });
    await new Promise<void>((r) => inst.listen(0, () => r()));
    const { port } = inst.address() as AddressInfo;
    const baseURL = `http://127.0.0.1:${port}`;

    const child = spawn("node", [ENTRY], {
        // Deliberately provide only the read token; NO write/apply token env.
        env: {
            ...process.env,
            AUTHENTIK_URL: baseURL,
            AUTHENTIK_TOKEN: "read-only-token",
            AUTHENTIK_WRITE_TOKEN: "",
            AUTHENTIK_APPLY_TOKEN: "",
        },
        stdio: ["pipe", "pipe", "pipe"],
    });

    try {
        let err = "";
        child.stderr?.on("data", (d) => (err += String(d)));
        await new Promise((r) => setTimeout(r, 1500));
        // Ready banner goes to stderr; presence means it constructed its client
        // and connected without needing any write/apply credential.
        assert.match(err, /ready/);
    } finally {
        child.kill();
        inst.close();
    }
});
