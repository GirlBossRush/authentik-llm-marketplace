#!/usr/bin/env node
/**
 * @file `/ak-docs-url` helper — print the resolved authentik docs + integrations
 * base URLs (and which `.env` key supplied the docs URL) on demand, so the
 * resolution can be checked mid-session without restarting. Uses the same
 * env-only resolver as the SessionStart hook, so the two never drift.
 */

import { parseEnvironment } from "./lib/parse.ts";
import {
    resolveDocsURLFromEnv,
    resolveIntegrationsURL,
} from "./lib/resolve.ts";

const env = parseEnvironment();
const docsURL = resolveDocsURLFromEnv(env);
const integrationsURL = resolveIntegrationsURL(env);

const docsSource = env.AK_AGENT_DOCS_URL?.trim()
    ? "AK_AGENT_DOCS_URL"
    : env.AK_DOCS_URL?.trim()
      ? "AK_DOCS_URL"
      : "default (no override set)";

process.stdout.write(
    [
        `Docs base URL:         ${docsURL}`,
        `  source:              ${docsSource}`,
        `Integrations base URL: ${integrationsURL}`,
        ``,
        `Start at ${docsURL}/llms.txt, follow the index to the relevant page, then fetch its .md.`,
        ``,
    ].join("\n"),
);
