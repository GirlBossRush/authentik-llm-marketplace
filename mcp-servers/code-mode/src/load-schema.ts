/** @file Fetch the running instance's OpenAPI schema at startup. */

import { parse } from "yaml";

import type { AKConfig } from "./config.ts";
import { derefSchema } from "./schema.ts";

/** Fetch and dereference the running instance's OpenAPI document. */
export async function fetchSchema(config: AKConfig): Promise<any> {
  const url = `${config.baseUrl}/api/v3/schema/`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${config.token}`,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`failed to fetch schema from ${url}: HTTP ${res.status}`);
  }
  const text = await res.text();
  // The endpoint serves JSON by default; parse() handles both JSON and YAML.
  return derefSchema(parse(text));
}
