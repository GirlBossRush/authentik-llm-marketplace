/**
 * @file Trusted, server-computed diff between a proposed blueprint and the live
 * authentik instance — the read-only half of the credential-free "prepare to
 * apply" handoff.
 *
 * Security property (the reason this lives server-side, not in the agent): the
 * diff emits exactly ONE {@link DiffObject} per blueprint entry — the FULL
 * object list, nothing collapsed or omitted. An object the agent tries to sneak
 * in is therefore always surfaced to the operator. Each object is classified by
 * reading the live instance (GET the model's list, then matching on the entry's
 * identifiers), never by trusting the blueprint's own claims about current state.
 *
 * Reads only: every call goes through the `Ak` read client as a GET. The client
 * already blocks writes and secret-reveal paths.
 */

import type { Ak } from "./client.ts";

/**
 * A single parsed blueprint entry. Mirrors the shape the validator works with:
 * a model name, the identifiers that locate the live object, and the attrs the
 * blueprint would set.
 */
export interface ParsedEntry {
    /** Django app-label model, e.g. `authentik_core.application`. */
    model: string;
    /** Fields that uniquely locate the object (e.g. `{ slug: "grafana" }`). */
    identifiers: Record<string, unknown>;
    /** Attributes the blueprint would write. Only these are compared. */
    attrs?: Record<string, unknown>;
}

/** The classification of one blueprint entry against the live instance. */
export interface DiffObject {
    /** The entry's model. */
    model: string;
    /** A human-readable identifier for the object (the entry's identifiers). */
    identifier: string;
    /** `create` if absent live; `update`/`unchanged` if present. */
    status: "create" | "update" | "unchanged";
    /** Per-field before/after, present only for `update`. */
    changedFields?: Record<string, { from: unknown; to: unknown }>;
    /**
     * `true` when existence could NOT be positively confirmed — a non-200 read,
     * an unmapped model, or a truncated provider list with no match on the
     * fetched page. The `status` is still emitted best-effort (typically
     * `create`), but this flag tells the operator to review manually rather than
     * trust the classification.
     */
    unexpected?: boolean;
}

/** The full, un-collapsed diff: one entry in → one object out. */
export interface BlueprintDiff {
    objects: DiffObject[];
}

/**
 * Maps a blueprint model to its read-only list endpoint and the query
 * parameters the endpoint accepts as exact filters. Identifiers not listed here
 * fall back to client-side matching against the returned results.
 */
const MODEL_LIST: Readonly<
    Record<
        string,
        {
            path: string;
            filterParams: readonly string[];
            /**
             * When the endpoint exposes no exact identifier filter, matching is
             * client-side over a single fetched page. Request the largest page
             * the API allows so the match window is as wide as possible.
             */
            wideFetch?: boolean;
        }
    >
> = {
    "authentik_core.application": {
        path: "/core/applications/",
        filterParams: ["slug"],
    },
    "authentik_providers_oauth2.oauth2provider": {
        path: "/providers/oauth2/",
        // No exact `name` filter exposed; match client-side on the results.
        filterParams: [],
        wideFetch: true,
    },
    "authentik_providers_saml.samlprovider": {
        path: "/providers/saml/",
        filterParams: [],
        wideFetch: true,
    },
};

/** The largest page size authentik's DRF list endpoints accept. */
const MAX_PAGE_SIZE = 100;

/**
 * The outcome of looking up an entry against the live instance.
 *
 * `found` carries the live object. `absent` means existence was positively
 * confirmed to be false (a 200 read over a complete result window with no
 * match). `unconfirmed` means we could NOT verify existence — a non-200 read,
 * an unmapped model, or a client-side-matched page that was truncated — so the
 * operator must review manually rather than trust a `create` classification.
 */
type LookupResult =
    | { kind: "found"; live: Record<string, unknown> }
    | { kind: "absent" }
    | { kind: "unconfirmed" };

/** Render an identifiers map as a stable, readable string for the operator. */
function formatIdentifier(identifiers: Record<string, unknown>): string {
    const parts = Object.entries(identifiers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${String(v)}`);
    return parts.join(",");
}

/** True if `obj` matches every identifier field exactly. */
function matchesIdentifiers(
    obj: Record<string, unknown>,
    identifiers: Record<string, unknown>,
): boolean {
    for (const [key, value] of Object.entries(identifiers)) {
        if (obj[key] !== value) return false;
    }
    return true;
}

/** Extract the `results` array from a DRF list response, defensively. */
function extractResults(data: unknown): Record<string, unknown>[] {
    if (data && typeof data === "object" && "results" in data) {
        const results = (data as { results: unknown }).results;
        if (Array.isArray(results)) {
            return results.filter(
                (r): r is Record<string, unknown> =>
                    r != null && typeof r === "object",
            );
        }
    }
    return [];
}

/**
 * True if a DRF list response indicates more pages exist beyond the one
 * fetched. authentik's pagination object carries a `next` page number that is
 * `0` (falsy) on the last page; a truthy value means the result window we
 * matched against is incomplete.
 */
function hasMorePages(data: unknown): boolean {
    if (data && typeof data === "object" && "pagination" in data) {
        const pagination = (data as { pagination: unknown }).pagination;
        if (
            pagination &&
            typeof pagination === "object" &&
            "next" in pagination
        ) {
            const next = (pagination as { next: unknown }).next;
            if (typeof next === "number") return next > 0;
            // DRF's default paginator uses a URL string for `next`.
            if (typeof next === "string") return next.length > 0;
            return Boolean(next);
        }
    }
    return false;
}

/**
 * Look up the live object matching an entry.
 *
 * Always GETs the model's list endpoint (passing supported identifier fields as
 * query filters to narrow the result set) and then re-checks every identifier
 * client-side, so a non-filtering or over-broad endpoint can never produce a
 * false match.
 *
 * Returns `unconfirmed` rather than guessing whenever existence cannot be
 * positively verified: an unmapped model, a non-200 read, or a client-side
 * match over a page that was truncated (more pages exist) with no hit — in
 * which case the object could live on a page we never fetched.
 */
async function findLiveObject(
    entry: ParsedEntry,
    ak: Ak,
): Promise<LookupResult> {
    const mapping = MODEL_LIST[entry.model];
    if (!mapping) return { kind: "unconfirmed" };

    const query: Record<string, string | number> = {};
    for (const param of mapping.filterParams) {
        const value = entry.identifiers[param];
        if (value !== undefined && value !== null) {
            query[param] = String(value);
        }
    }
    // Endpoints without an exact identifier filter are matched client-side over
    // a single page; widen that page to the API maximum.
    if (mapping.wideFetch) {
        query.page_size = MAX_PAGE_SIZE;
    }

    const res = await ak.request("GET", mapping.path, { query });
    if (res.status !== 200) return { kind: "unconfirmed" };

    const results = extractResults(res.data);
    const match = results.find((obj) =>
        matchesIdentifiers(obj, entry.identifiers),
    );
    if (match) return { kind: "found", live: match };

    // No match on the fetched page. If this was a client-side match over a
    // truncated list, the object may live on an unfetched page — can't confirm.
    if (mapping.wideFetch && hasMorePages(res.data)) {
        return { kind: "unconfirmed" };
    }
    return { kind: "absent" };
}

/** Compare the entry's attrs against the live object, field by field. */
function diffAttrs(
    live: Record<string, unknown>,
    attrs: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> | undefined {
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const [key, to] of Object.entries(attrs)) {
        const from = live[key];
        if (!deepEqual(from, to)) {
            changed[key] = { from, to };
        }
    }
    return Object.keys(changed).length > 0 ? changed : undefined;
}

/** Structural equality sufficient for blueprint attr values (JSON-shaped). */
function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return false;
    if (typeof a !== "object") return false;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        return a.every((item, i) => deepEqual(item, b[i]));
    }

    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const key of keys) {
        if (!deepEqual(ao[key], bo[key])) return false;
    }
    return true;
}

/**
 * Compute the trusted diff: one {@link DiffObject} per blueprint entry,
 * classified `create` / `update` / `unchanged` by reading the live instance.
 *
 * The output is intentionally complete — every entry produces an object, so the
 * operator always sees the full set of changes a blueprint would make.
 */
export async function computeDiff(
    entries: ParsedEntry[],
    ak: Ak,
): Promise<BlueprintDiff> {
    const objects: DiffObject[] = [];

    for (const entry of entries) {
        const identifier = formatIdentifier(entry.identifiers);
        const attrs = entry.attrs ?? {};
        const result = await findLiveObject(entry, ak);

        if (result.kind !== "found") {
            // Best-effort `create`, but flag the entries where we could not
            // positively confirm absence so the operator reviews manually
            // instead of trusting a possibly-wrong `create`.
            objects.push({
                model: entry.model,
                identifier,
                status: "create",
                ...(result.kind === "unconfirmed" ? { unexpected: true } : {}),
            });
            continue;
        }

        const live = result.live;
        const changedFields = diffAttrs(live, attrs);
        if (changedFields) {
            objects.push({
                model: entry.model,
                identifier,
                status: "update",
                changedFields,
            });
        } else {
            objects.push({
                model: entry.model,
                identifier,
                status: "unchanged",
            });
        }
    }

    return { objects };
}
