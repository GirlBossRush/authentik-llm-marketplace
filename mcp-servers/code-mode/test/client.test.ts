import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";

import { createAk, isSecretRevealPath } from "#client";

/** Spin up a throwaway HTTP server and run `fn` against its base URL. */
async function withMock<T>(
    handler: RequestListener,
    fn: (baseURL: string) => Promise<T>,
): Promise<T> {
    const server = createServer(handler);
    await new Promise<void>((r) => server.listen(0, () => r()));
    const { port } = server.address() as AddressInfo;
    try {
        return await fn(`http://127.0.0.1:${port}`);
    } finally {
        server.close();
    }
}

test("request performs an authenticated GET and parses JSON", async () => {
    await withMock(
        (req, res) => {
            assert.equal(req.headers.authorization, "Bearer tok");
            assert.equal(req.url, "/api/v3/core/users/?search=alice");
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: true }));
        },
        async (baseURL) => {
            const ak = createAk(
                { baseURL, token: "tok" },
                { allowWrites: false },
            );
            const out = await ak.request("GET", "/core/users/", {
                query: { search: "alice" },
            });
            assert.equal(out.status, 200);
            assert.deepEqual(out.data, { ok: true });
        },
    );
});

test("read-only client rejects a write before any network call", async () => {
    const ak = createAk(
        { baseURL: "http://127.0.0.1:1", token: "tok" },
        { allowWrites: false },
    );
    await assert.rejects(
        () => ak.request("POST", "/stages/captcha/", { body: {} }),
        /writes are not supported/,
    );
});

test("write-enabled client sends a POST body", async () => {
    await withMock(
        (req, res) => {
            let chunks = "";
            req.on("data", (c) => (chunks += c));
            req.on("end", () => {
                assert.equal(req.method, "POST");
                assert.deepEqual(JSON.parse(chunks), { name: "cap" });
                res.statusCode = 201;
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify({ pk: 1 }));
            });
        },
        async (baseURL) => {
            const ak = createAk(
                { baseURL, token: "tok" },
                { allowWrites: true },
            );
            const out = await ak.request("POST", "/stages/captcha/", {
                body: { name: "cap" },
            });
            assert.equal(out.status, 201);
            assert.deepEqual(out.data, { pk: 1 });
        },
    );
});

test("isSecretRevealPath flags token/key reveal endpoints, not normal reads", () => {
    assert.equal(isSecretRevealPath("/core/tokens/abc/view_key/"), true);
    assert.equal(
        isSecretRevealPath("/crypto/certificatekeypairs/x/view_private_key/"),
        true,
    );
    assert.equal(isSecretRevealPath("/core/applications/"), false);
});

test("ak.request refuses secret-reveal paths before any network call", async () => {
    const ak = createAk(
        { baseURL: "http://127.0.0.1:1", token: "t" },
        { allowWrites: false },
    );
    await assert.rejects(
        () => ak.request("GET", "/core/tokens/abc/view_key/"),
        /secret-reveal/,
    );
});
