import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { parse } from "yaml";
import type { OpenAPIV3 } from "openapi-types";

import { derefSchema } from "#schema";
import { createTools } from "#tools";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SPEC = derefSchema(
    parse(readFileSync(resolve(__dirname, "__fixtures__/schema.yml"), "utf-8")),
) as OpenAPIV3.Document;

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

test("search returns matching operations", () => {
    const tools = createTools({
        spec: SPEC,
        config: { baseURL: "http://x", token: "t" },
    });
    const { operations } = tools.search({ query: "list users" });
    assert.ok(operations.some((o) => o.operationId === "core_users_list"));
});

test("execute runs read-only code", async () => {
    await withMock(
        (_req, res) => res.end(JSON.stringify([{ username: "alice" }])),
        async (baseURL) => {
            const tools = createTools({
                spec: SPEC,
                config: { baseURL: baseURL, token: "t" },
            });
            const { result } = await tools.execute({
                code: `return (await ak.request("GET","/core/users/")).data;`,
            });
            assert.deepEqual(result, [{ username: "alice" }]);
        },
    );
});

test("execute blocks writes (read-only binding)", async () => {
    const tools = createTools({
        spec: SPEC,
        config: { baseURL: "http://127.0.0.1:1", token: "t" },
    });
    await assert.rejects(
        () =>
            tools.execute({
                code: `return await ak.request("POST","/stages/captcha/",{body:{}});`,
            }),
        /writes are not supported/,
    );
});

test("tools expose validate and no longer expose executeWrite", () => {
    const spec = {
        openapi: "3.0.3",
        info: { title: "t", version: "1" },
        paths: {},
        components: {},
    };
    const tools = createTools({
        spec,
        config: { baseURL: "http://x", token: "t" },
    });
    assert.equal(typeof tools.validate, "function");
    assert.equal("executeWrite" in tools, false);
    assert.equal(
        tools.validate({ content: "version: 1\nentries: []" }).ok,
        true,
    );
});
