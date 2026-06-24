import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { OpenAPIV3 } from "openapi-types";

import { derefSchema, searchOperations } from "#schema";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SPEC = derefSchema(
    parse(readFileSync(resolve(__dirname, "__fixtures__/schema.yml"), "utf-8")),
) as OpenAPIV3.Document;

test("derefSchema inlines internal $refs", () => {
    const op = SPEC.paths["/core/users/"]?.get;
    const response = op?.responses?.["200"] as OpenAPIV3.ResponseObject;
    const schema = response.content?.["application/json"]
        ?.schema as OpenAPIV3.SchemaObject;
    const username = schema.properties?.username as OpenAPIV3.SchemaObject;
    assert.equal(username.type, "string");
});

test("searchOperations matches by summary/tag/path and returns slices", () => {
    const hits = searchOperations(SPEC, "captcha stage");
    assert.equal(hits.length, 1);
    const hit = hits[0];
    assert.ok(hit);
    assert.equal(hit.method, "POST");
    assert.equal(hit.path, "/stages/captcha/");
    assert.equal(hit.operationId, "stages_captcha_create");
    const body = hit.requestBody as OpenAPIV3.RequestBodyObject;
    const schema = body.content["application/json"]
        ?.schema as OpenAPIV3.SchemaObject;
    assert.ok(schema.properties?.public_key);
});

test("searchOperations returns [] when nothing matches", () => {
    assert.deepEqual(searchOperations(SPEC, "nonexistent-zzz"), []);
});

test("searchOperations honors the limit", () => {
    assert.ok(searchOperations(SPEC, "e", 1).length <= 1);
});
