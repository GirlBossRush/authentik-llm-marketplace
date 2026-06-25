import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDiff } from "#blueprint-diff";

const ak = {
    request: async (_m: string, path: string) => {
        if (path.includes("/applications/"))
            return {
                status: 200,
                data: { results: [{ slug: "grafana", name: "Old" }] },
            };
        return { status: 200, data: { results: [] } };
    },
};

test("diff returns one object per entry, marks create vs update", async () => {
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "grafana" },
            attrs: { name: "New" },
        },
        {
            model: "authentik_core.application",
            identifiers: { slug: "brandnew" },
            attrs: { name: "Brand New" },
        },
    ];
    const d = await computeDiff(entries as never, ak as never);
    assert.equal(d.objects.length, 2); // full list, nothing hidden
    const g = d.objects.find((o) => o.identifier.includes("grafana"));
    assert.equal(g?.status, "update");
    assert.deepEqual(g?.changedFields?.name, { from: "Old", to: "New" });
    const b = d.objects.find((o) => o.identifier.includes("brandnew"));
    assert.equal(b?.status, "create");
});

test("an existing object with no field changes is `unchanged`", async () => {
    const live = {
        request: async (_m: string, _p: string) => ({
            status: 200,
            data: { results: [{ slug: "grafana", name: "Same" }] },
        }),
    };
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "grafana" },
            attrs: { name: "Same" },
        },
    ];
    const d = await computeDiff(entries as never, live as never);
    assert.equal(d.objects.length, 1);
    assert.equal(d.objects[0]?.status, "unchanged");
    assert.equal(d.objects[0]?.changedFields, undefined);
});

test("returns the FULL object list — a snuck-in extra entry is always visible", async () => {
    // Even if an attacker hides an extra object among legitimate ones, computeDiff
    // must emit one DiffObject per entry — the operator sees every object.
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "legit" },
            attrs: { name: "Legit" },
        },
        {
            model: "authentik_providers_oauth2.oauth2provider",
            identifiers: { name: "sneaky-provider" },
            attrs: { name: "sneaky-provider" },
        },
        {
            model: "authentik_core.application",
            identifiers: { slug: "another" },
            attrs: { name: "Another" },
        },
    ];
    const d = await computeDiff(entries as never, ak as never);
    assert.equal(d.objects.length, entries.length);
    assert.ok(d.objects.some((o) => o.identifier.includes("sneaky-provider")));
    assert.ok(d.objects.every((o) => o.status === "create"));
});

test("multiple changed fields are all reported in changedFields", async () => {
    const live = {
        request: async (_m: string, _p: string) => ({
            status: 200,
            data: {
                results: [
                    {
                        slug: "app",
                        name: "Old Name",
                        meta_launch_url: "https://old",
                    },
                ],
            },
        }),
    };
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "app" },
            attrs: { name: "New Name", meta_launch_url: "https://new" },
        },
    ];
    const d = await computeDiff(entries as never, live as never);
    assert.equal(d.objects[0]?.status, "update");
    assert.deepEqual(d.objects[0]?.changedFields, {
        name: { from: "Old Name", to: "New Name" },
        meta_launch_url: { from: "https://old", to: "https://new" },
    });
});

test("only attrs present in the blueprint entry are compared", async () => {
    // The live object may carry many fields the blueprint doesn't set; those
    // must NOT show up as changes.
    const live = {
        request: async (_m: string, _p: string) => ({
            status: 200,
            data: {
                results: [
                    {
                        slug: "app",
                        name: "Same",
                        pk: "abc",
                        extra: "ignore-me",
                    },
                ],
            },
        }),
    };
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "app" },
            attrs: { name: "Same" },
        },
    ];
    const d = await computeDiff(entries as never, live as never);
    assert.equal(d.objects[0]?.status, "unchanged");
});

test("a provider entry resolves to its providers endpoint and matches by name", async () => {
    let requestedPath = "";
    const live = {
        request: async (_m: string, path: string) => {
            requestedPath = path;
            return {
                status: 200,
                data: {
                    results: [
                        { name: "my-oauth", client_type: "confidential" },
                    ],
                },
            };
        },
    };
    const entries = [
        {
            model: "authentik_providers_oauth2.oauth2provider",
            identifiers: { name: "my-oauth" },
            attrs: { client_type: "public" },
        },
    ];
    const d = await computeDiff(entries as never, live as never);
    assert.ok(requestedPath.includes("/providers/oauth2/"));
    assert.equal(d.objects[0]?.status, "update");
    assert.deepEqual(d.objects[0]?.changedFields?.client_type, {
        from: "confidential",
        to: "public",
    });
});

test("identifier mismatch in returned list is treated as create (not a false update)", async () => {
    // The list endpoint may return objects that don't match the identifier
    // (e.g. a non-filterable endpoint). computeDiff must match by the entry's
    // identifiers, not blindly take results[0].
    const live = {
        request: async (_m: string, _p: string) => ({
            status: 200,
            data: { results: [{ slug: "someone-else", name: "Other" }] },
        }),
    };
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "mine" },
            attrs: { name: "Mine" },
        },
    ];
    const d = await computeDiff(entries as never, live as never);
    assert.equal(d.objects[0]?.status, "create");
});

test("model field is carried through on each DiffObject", async () => {
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "brandnew" },
            attrs: { name: "Brand New" },
        },
    ];
    const d = await computeDiff(entries as never, ak as never);
    assert.equal(d.objects[0]?.model, "authentik_core.application");
});

test("a non-200 read cannot confirm existence — flagged unexpected, not silently created", async () => {
    const failing = {
        request: async (_m: string, _p: string) => ({
            status: 500,
            data: null,
        }),
    };
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "grafana" },
            attrs: { name: "New" },
        },
    ];
    const d = await computeDiff(entries as never, failing as never);
    assert.equal(d.objects.length, 1);
    assert.equal(d.objects[0]?.unexpected, true);
});

test("an unknown/unmapped model cannot be verified — flagged unexpected", async () => {
    const entries = [
        {
            model: "authentik_unknown.mysterymodel",
            identifiers: { name: "who-knows" },
            attrs: { name: "who-knows" },
        },
    ];
    const d = await computeDiff(entries as never, ak as never);
    assert.equal(d.objects.length, 1);
    assert.equal(d.objects[0]?.unexpected, true);
});

test("a truncated provider list with no match — flagged unexpected (window may have missed it)", async () => {
    const truncated = {
        request: async (_m: string, _p: string) => ({
            status: 200,
            data: {
                results: [{ name: "someone-else" }],
                pagination: { next: 2 },
            },
        }),
    };
    const entries = [
        {
            model: "authentik_providers_oauth2.oauth2provider",
            identifiers: { name: "my-oauth" },
            attrs: { name: "my-oauth" },
        },
    ];
    const d = await computeDiff(entries as never, truncated as never);
    assert.equal(d.objects.length, 1);
    assert.equal(d.objects[0]?.unexpected, true);
});

test("a genuine create (200, full list, no match) stays a plain create with no unexpected flag", async () => {
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "brandnew" },
            attrs: { name: "Brand New" },
        },
    ];
    const d = await computeDiff(entries as never, ak as never);
    assert.equal(d.objects[0]?.status, "create");
    assert.ok(!d.objects[0]?.unexpected);
});

test("provider reads request the max page size to widen the client-side match window", async () => {
    let pageSize: string | number | undefined;
    const live = {
        request: async (
            _m: string,
            _p: string,
            opts?: { query?: Record<string, string | number> },
        ) => {
            pageSize = opts?.query?.page_size;
            return {
                status: 200,
                data: { results: [{ name: "my-oauth" }] },
            };
        },
    };
    const entries = [
        {
            model: "authentik_providers_oauth2.oauth2provider",
            identifiers: { name: "my-oauth" },
            attrs: { name: "my-oauth" },
        },
    ];
    await computeDiff(entries as never, live as never);
    assert.equal(Number(pageSize), 100);
});
