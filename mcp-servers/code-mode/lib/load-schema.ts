/** @file Fetch the running instance's OpenAPI schema at startup. */

import type { OpenAPIV3 } from "openapi-types";
import { parse } from "yaml";

import type { AKConfig } from "./config.ts";
import { derefSchema } from "./schema.ts";

/** Fetch and dereference the running instance's OpenAPI document. */
export async function fetchSchema(
    config: AKConfig,
): Promise<OpenAPIV3.Document> {
    const url = `${config.baseURL}/api/v3/schema/`;
    const res = await fetch(url, {
        headers: {
            authorization: `Bearer ${config.token}`,
            accept: "application/json",
        },
    });
    if (!res.ok) {
        throw new Error(
            `failed to fetch schema from ${url}: HTTP ${res.status}`,
        );
    }

    const text = await res.text();
    // The endpoint serves JSON by default; parse() handles both JSON and YAML.
    // The instance is the source of truth for its own schema, so we trust the
    // shape at this single boundary.
    return derefSchema(parse(text) as unknown) as OpenAPIV3.Document;
}
