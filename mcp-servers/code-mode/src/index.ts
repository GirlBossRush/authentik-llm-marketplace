#!/usr/bin/env node
/** @file authentik code-mode MCP server (stdio). */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodRawShape } from "zod";

import { loadConfig } from "./config.ts";
import { fetchSchema } from "./load-schema.ts";
import { createTools } from "./tools.ts";
import { SERVER_NAME, SERVER_VERSION } from "./version.ts";

/** Wrap a tool result object as MCP text content. */
const asContent = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

/**
 * `McpServer.tool`'s generic inference over a zod raw shape trips TS2589
 * ("excessively deep") under strict checking. Re-expose it through a precise,
 * args-generic signature (a type assertion, not `any`) so each registration is
 * still typed without the deep instantiation.
 */
type RegisterTool = <Args>(
  name: string,
  description: string,
  schema: ZodRawShape,
  cb: (args: Args) => CallToolResult | Promise<CallToolResult>,
) => void;

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const spec = await fetchSchema(config);
  const tools = createTools({ spec, config });

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  const tool = server.tool.bind(server) as unknown as RegisterTool;

  tool<{ query: string; limit?: number }>(
    "search",
    "Search authentik's API: free-text query over path/operationId/summary/tags. Returns matching operations with their parameter, request, and response schemas. Use this to discover what to call before writing code.",
    { query: z.string(), limit: z.number().int().positive().optional() },
    async (args) => asContent(tools.search(args)),
  );

  tool<{ code: string }>(
    "execute",
    "Run JavaScript against the live authentik instance with a READ-ONLY `ak.request(method, path, { query, body })` client (GET/HEAD/OPTIONS only). `return` a value to receive it. Compose multiple reads in one block.",
    { code: z.string() },
    async (args) => asContent(await tools.execute(args)),
  );

  tool<{ code: string; confirm?: string }>(
    "execute_write",
    "Run JavaScript with a WRITE-ENABLED `ak.request(...)` client. Two-step: call once with { code } to receive a confirm token + preview, then call again with { code, confirm } (same code) to run it. Reads and writes may be mixed in one block.",
    { code: z.string(), confirm: z.string().optional() },
    async (args) => asContent(await tools.executeWrite(args)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} ${SERVER_VERSION} ready (${config.baseUrl})`);
}

main().catch((err) => {
  console.error(
    `${SERVER_NAME} failed to start: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
