import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { OpenAPIV3 } from "openapi-types";

import { derefSchema } from "#schema";
import { createTools } from "#tools";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SPEC = derefSchema(
    parse(readFileSync(resolve(__dirname, "__fixtures__/schema.yml"), "utf-8")),
) as OpenAPIV3.Document;

test("PIVOT: discover an endpoint, read data, then validate a proposed blueprint", async () => {
    const tools = createTools({
        spec: SPEC,
        config: { baseURL: "http://127.0.0.1:1", token: "t" },
    });

    // 1. The agent discovers the endpoint.
    const { operations } = tools.search({ query: "create captcha stage" });
    assert.ok(
        operations.some((o) => o.operationId === "stages_captcha_create"),
    );

    // 2. The agent proposes a blueprint; the validator rejects a non-allow-listed model.
    const badBlueprint = `
version: 1
entries:
  - model: authentik_core.token
    attrs:
      identifier: my-token
`;
    const badResult = tools.validate({ content: badBlueprint });
    assert.equal(badResult.ok, false);
    // v2: model is rejected as not in the allow-list (not the old "denied model" message)
    assert.ok(badResult.violations.some((v) => v.includes("allow-list") || v.includes("not permitted")));

    // 3. A clean blueprint (allowed model) passes.
    const goodBlueprint = `
version: 1
entries:
  - model: authentik_core.application
    attrs:
      name: my-app
      slug: my-app
`;
    const goodResult = tools.validate({ content: goodBlueprint });
    assert.equal(goodResult.ok, true);
    assert.deepEqual(goodResult.violations, []);
});
