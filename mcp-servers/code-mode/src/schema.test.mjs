import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parse } from "yaml";

import { derefSchema, searchOperations } from "./schema.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SPEC = derefSchema(
  parse(readFileSync(resolve(__dirname, "__fixtures__/schema.yml"), "utf-8")),
);

test("derefSchema inlines internal $refs", () => {
  const op = SPEC.paths["/core/users/"].get;
  assert.equal(
    op.responses["200"].content["application/json"].schema.properties.username
      .type,
    "string",
  );
});

test("searchOperations matches by summary/tag/path and returns slices", () => {
  const hits = searchOperations(SPEC, "captcha stage");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].method, "POST");
  assert.equal(hits[0].path, "/stages/captcha/");
  assert.equal(hits[0].operationId, "stages_captcha_create");
  assert.ok(
    hits[0].requestBody.content["application/json"].schema.properties
      .public_key,
  );
});

test("searchOperations returns [] when nothing matches", () => {
  assert.deepEqual(searchOperations(SPEC, "nonexistent-zzz"), []);
});

test("searchOperations honors the limit", () => {
  assert.ok(searchOperations(SPEC, "e", 1).length <= 1);
});
