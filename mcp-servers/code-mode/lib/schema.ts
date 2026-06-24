/** @file OpenAPI schema loading, $ref dereferencing, and operation search. */

import type { OpenAPIV3 } from "openapi-types";

const HTTP_METHODS = [
    "get",
    "put",
    "post",
    "delete",
    "patch",
    "head",
    "options",
] as const;

export interface OperationHit {
    method: string;
    path: string;
    operationId?: string;
    summary?: string;
    tags: string[];
    parameters: NonNullable<OpenAPIV3.OperationObject["parameters"]>;
    requestBody?: OpenAPIV3.OperationObject["requestBody"];
    responses?: OpenAPIV3.OperationObject["responses"];
}

/** Resolve a single `#/a/b/c` JSON pointer against the root document. */
function resolvePointer(root: unknown, ref: string): unknown {
    const parts = ref.replace(/^#\//, "").split("/");
    let node: unknown = root;
    for (const part of parts) {
        if (node === null || typeof node !== "object") return undefined;
        node = (node as Record<string, unknown>)[part];
        if (node === undefined) return undefined;
    }
    return node;
}

/**
 * Return the document with internal `$ref`s inlined. Operates on arbitrary JSON
 * and is cycle-safe: a ref already on the resolution stack is left as `{ $ref }`
 * to break the loop.
 */
export function derefSchema(spec: unknown): unknown {
    const seen = new Set<string>();
    const walk = (node: unknown): unknown => {
        if (node === null || typeof node !== "object") return node;
        if (Array.isArray(node)) return node.map(walk);
        const obj = node as Record<string, unknown>;
        if (typeof obj.$ref === "string") {
            if (seen.has(obj.$ref)) return { $ref: obj.$ref };
            seen.add(obj.$ref);
            const resolved = walk(resolvePointer(spec, obj.$ref));
            seen.delete(obj.$ref);
            return resolved ?? node;
        }
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) out[k] = walk(v);
        return out;
    };
    return walk(spec);
}

/** Search operations by free-text query over path + operationId + summary + tags. */
export function searchOperations(
    spec: OpenAPIV3.Document,
    query: string,
    limit = 20,
): OperationHit[] {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored: { score: number; op: OperationHit }[] = [];
    for (const [path, item] of Object.entries(spec.paths ?? {})) {
        if (!item) continue;
        for (const method of HTTP_METHODS) {
            const op = item[method];
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
