import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { parse } from "yaml";
import type { OpenAPIV3 } from "openapi-types";

import { derefSchema } from "./schema.ts";
import { createTools } from "./tools.ts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SPEC = derefSchema(
  parse(readFileSync(resolve(__dirname, "__fixtures__/schema.yml"), "utf-8")),
) as OpenAPIV3.Document;

async function withMock<T>(
  handler: RequestListener,
  fn: (baseUrl: string) => Promise<T>,
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
    config: { baseUrl: "http://x", token: "t" },
  });
  const { operations } = tools.search({ query: "list users" });
  assert.ok(operations.some((o) => o.operationId === "core_users_list"));
});

test("execute runs read-only code", async () => {
  await withMock(
    (_req, res) => res.end(JSON.stringify([{ username: "alice" }])),
    async (baseUrl) => {
      const tools = createTools({
        spec: SPEC,
        config: { baseUrl, token: "t" },
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
    config: { baseUrl: "http://127.0.0.1:1", token: "t" },
  });
  await assert.rejects(
    () =>
      tools.execute({
        code: `return await ak.request("POST","/stages/captcha/",{body:{}});`,
      }),
    /writes are disabled/,
  );
});

test("execute_write requires a matching confirm token, then runs", async () => {
  await withMock(
    (_req, res) => {
      res.statusCode = 201;
      res.end(JSON.stringify({ pk: 7 }));
    },
    async (baseUrl) => {
      const tools = createTools({
        spec: SPEC,
        config: { baseUrl, token: "t" },
      });
      const code = `return (await ak.request("POST","/stages/captcha/",{body:{name:"c"}})).data;`;
      const first = await tools.executeWrite({ code });
      assert.ok("status" in first);
      assert.equal(first.status, "needs_confirmation");
      assert.equal(first.token, tools.confirmTokenFor(code));
      const second = await tools.executeWrite({ code, confirm: first.token });
      assert.ok("result" in second);
      assert.deepEqual(second.result, { pk: 7 });
    },
  );
});

test("execute_write rejects a wrong confirm token without running", async () => {
  const tools = createTools({
    spec: SPEC,
    config: { baseUrl: "http://127.0.0.1:1", token: "t" },
  });
  const code = `return await ak.request("POST","/stages/captcha/",{body:{}});`;
  const out = await tools.executeWrite({ code, confirm: "wrongtok" });
  assert.ok("status" in out);
  assert.equal(out.status, "needs_confirmation");
});
