/** @file OpenAPI schema loading, $ref dereferencing, and operation search. */

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "patch",
  "head",
  "options",
];

/**
 * Resolve a single `#/a/b/c` JSON pointer against the root document.
 * @param {any} root
 * @param {string} ref
 * @returns {any}
 */
function resolvePointer(root, ref) {
  const parts = ref.replace(/^#\//, "").split("/");
  let node = root;
  for (const part of parts) {
    node = node?.[part];
    if (node === undefined) return undefined;
  }
  return node;
}

/**
 * Return the spec with internal `$ref`s inlined. Cycle-safe: a ref already on
 * the current resolution stack is left as `{ $ref }` to break the loop.
 * @param {any} spec
 * @returns {any}
 */
export function derefSchema(spec) {
  const seen = new Set();
  /** @param {any} node @returns {any} */
  const walk = (node) => {
    if (node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node.$ref === "string") {
      if (seen.has(node.$ref)) return { $ref: node.$ref };
      seen.add(node.$ref);
      const resolved = walk(resolvePointer(spec, node.$ref));
      seen.delete(node.$ref);
      return resolved ?? node;
    }
    /** @type {Record<string, any>} */
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = walk(v);
    return out;
  };
  return walk(spec);
}

/**
 * Search operations by free-text query over path + operationId + summary + tags.
 * @param {any} spec A deref'd OpenAPI document.
 * @param {string} query
 * @param {number} [limit]
 * @returns {Array<object>}
 */
export function searchOperations(spec, query, limit = 20) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  /** @type {Array<{ score: number, op: object }>} */
  const scored = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = /** @type {any} */ (item)[method];
      if (!op) continue;
      const haystack = [
        path,
        op.operationId ?? "",
        op.summary ?? "",
        (op.tags ?? []).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      const score = tokens.filter((t) => haystack.includes(t)).length;
      if (score === 0) continue;
      scored.push({
        score,
        op: {
          method: method.toUpperCase(),
          path,
          operationId: op.operationId,
          summary: op.summary,
          tags: op.tags ?? [],
          parameters: op.parameters ?? [],
          requestBody: op.requestBody,
          responses: op.responses,
        },
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.op);
}
