import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { parse } from "yaml";
import type { OpenAPIV3 } from "openapi-types";

import { derefSchema } from "#schema";
import { createTools } from "#tools";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SPEC = derefSchema(
    parse(readFileSync(resolve(__dirname, "__fixtures__/schema.yml"), "utf-8")),
) as OpenAPIV3.Document;

test("PIVOT: discover + create a captcha stage in one confirmed write block", async () => {
    const calls: string[] = [];
    const inst = createServer((req, res) => {
        calls.push(`${req.method} ${req.url}`);
        res.statusCode = 201;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ pk: "stage-1", name: "captcha" }));
    });

    await new Promise<void>((r) => inst.listen(0, () => r()));

    try {
        const { port } = inst.address() as AddressInfo;
        const tools = createTools({
            spec: SPEC,
            config: { baseUrl: `http://127.0.0.1:${port}`, token: "t" },
        });

        // 1. The agent discovers the endpoint.
        const { operations } = tools.search({ query: "create captcha stage" });
        assert.ok(
            operations.some((o) => o.operationId === "stages_captcha_create"),
        );

        // 2. The agent writes one block; first call returns a confirm token.
        const code = `
      const stage = (await ak.request("POST", "/stages/captcha/", { body: { name: "captcha" } })).data;
      return stage.pk;
    `;

        const first = await tools.executeWrite({ code });

        assert.ok("status" in first);
        assert.equal(first.status, "needs_confirmation");

        // 3. Confirmed run performs the write.
        const second = await tools.executeWrite({ code, confirm: first.token });
        assert.ok("result" in second);
        assert.equal(second.result, "stage-1");
        assert.ok(calls.includes("POST /api/v3/stages/captcha/"));
    } finally {
        inst.close();
    }
});
