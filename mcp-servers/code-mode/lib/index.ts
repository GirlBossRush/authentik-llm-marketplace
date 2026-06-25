#!/usr/bin/env node
/** @file authentik code-mode MCP server (stdio). */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodRawShape } from "zod";

import { loadConfig } from "./config.ts";
import { resolveDocsURL, resolveIntegrationsURL } from "./docs-url.ts";
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

    // Version-aware docs URLs for THIS instance (env override → derive from
    // version → next.goauthentik.io).
    const version = spec.info?.version;
    const docsURL = resolveDocsURL(process.env, version);
    const integrationsURL = resolveIntegrationsURL(process.env);

    const server = new McpServer({
        name: SERVER_NAME,
        version: SERVER_VERSION,
    });

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

    tool<{ content: string }>(
        "validate_blueprint",
        "Validate a proposed authentik Blueprint (YAML) WITHOUT applying it. Returns {ok, violations, flags}. This server is propose-only: it never mutates the instance. The validator is an allow-list policy gate — only the onboarding models (Application, OAuth2 Provider, SAML Provider) and an explicit per-attribute allow-list pass; every YAML tag except curated !Find/!KeyOf references to built-ins is rejected, so expressions, secrets, and security-surface changes are inexpressible. For the apply handoff (diff, undo snapshot, irreversible flags, apply command) use prepare_apply.",
        { content: z.string() },
        async (args) => asContent(tools.validate(args)),
    );

    tool<{ content: string }>(
        "prepare_apply",
        "Validate a proposed authentik Blueprint and PREPARE it for the operator to apply: returns a trusted diff, an undo snapshot, irreversible-op flags, and the exact `ak apply_blueprint` command. This server never applies changes itself.",
        { content: z.string() },
        async (args) => asContent(await tools.prepare(args)),
    );

    tool<Record<string, never>>(
        "docs",
        "Return the authentik documentation base URLs for THIS instance (version-aware). Prefer these over any hardcoded docs URL: fetch `<docsURL>/llms.txt` (or `<integrationsURL>/llms.txt`), follow the index to the relevant page, then fetch its `.md`.",
        {},
        async () =>
            asContent({
                docsURL,
                integrationsURL,
                docsLlmsTxt: `${docsURL}/llms.txt`,
                integrationsLlmsTxt: `${integrationsURL}/llms.txt`,
                version: version ?? null,
            }),
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`${SERVER_NAME} ${SERVER_VERSION} ready (${config.baseURL})`);
}

main().catch((err) => {
    console.error(
        `${SERVER_NAME} failed to start: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
});
