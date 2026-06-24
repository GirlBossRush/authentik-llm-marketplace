/** @file Fetch the running instance's OpenAPI schema at startup. */

import { parse } from "yaml";

import { derefSchema } from "./schema.mjs";

/** @import { AKConfig } from "./config.mjs" */

/**
 * @param {AKConfig} config
 * @returns {Promise<any>} deref'd OpenAPI document
 */
export async function fetchSchema(config) {
    const url = `${config.baseUrl}/api/v3/schema/`;
    const res = await fetch(url, {
        headers: { authorization: `Bearer ${config.token}`, accept: "application/json" },
    });
    if (!res.ok) {
        throw new Error(`failed to fetch schema from ${url}: HTTP ${res.status}`);
    }
    const text = await res.text();
    // The endpoint serves JSON by default; parse() handles both JSON and YAML.
    return derefSchema(parse(text));
}
