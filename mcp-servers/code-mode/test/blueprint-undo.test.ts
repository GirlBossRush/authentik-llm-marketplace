import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "yaml";
import { buildUndoSnapshot } from "#blueprint-undo";

test("undo snapshot captures current state for updates (clean)", async () => {
    const ak = {
        request: async () => ({
            status: 200,
            data: { results: [{ slug: "grafana", name: "Old" }] },
        }),
    };
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "grafana" },
            attrs: { name: "New" },
        },
    ];
    const u = await buildUndoSnapshot(entries as never, ak as never);
    assert.equal(u.reversibility, "clean");
    assert.match(u.blueprint, /name: Old/);
});

test("delete entries are classified impossible", async () => {
    const ak = {
        request: async () => ({ status: 200, data: { results: [] } }),
    };
    const entries = [
        {
            model: "authentik_sources_oauth.oauthsource",
            state: "absent",
            identifiers: { slug: "x" },
        },
    ];
    const u = await buildUndoSnapshot(entries as never, ak as never);
    assert.equal(u.reversibility, "impossible");
    assert.ok(u.notes.some((n) => /cannot be undone|external/i.test(n)));
});

test("create-only entry (object absent live) is classified lossy", async () => {
    // The object does not exist yet; applying the blueprint creates it. The undo
    // is a delete, and a later recreate churns the UUID/refs — honestly lossy.
    const ak = {
        request: async () => ({ status: 200, data: { results: [] } }),
    };
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "brandnew" },
            attrs: { name: "Brand New" },
        },
    ];
    const u = await buildUndoSnapshot(entries as never, ak as never);
    assert.equal(u.reversibility, "lossy");
});

test("crypto entries are impossible even when not a delete", async () => {
    const ak = {
        request: async () => ({ status: 200, data: { results: [] } }),
    };
    const entries = [
        {
            model: "authentik_crypto.certificatekeypair",
            identifiers: { name: "my-cert" },
            attrs: { name: "my-cert" },
        },
    ];
    const u = await buildUndoSnapshot(entries as never, ak as never);
    assert.equal(u.reversibility, "impossible");
    assert.ok(u.notes.some((n) => /cannot be undone/i.test(n)));
});

test("worst classification wins: clean + lossy + impossible => impossible", async () => {
    const ak = {
        request: async (_m: string, path: string) => {
            if (path.includes("/applications/"))
                return {
                    status: 200,
                    data: { results: [{ slug: "exists", name: "Old" }] },
                };

            return { status: 200, data: { results: [] } };
        },
    };
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "exists" },
            attrs: { name: "New" },
        }, // clean (update of existing)
        {
            model: "authentik_core.application",
            identifiers: { slug: "brandnew" },
            attrs: { name: "Brand New" },
        }, // lossy (create-only)
        {
            model: "authentik_sources_oauth.oauthsource",
            state: "absent",
            identifiers: { slug: "gone" },
        }, // impossible (delete)
    ];
    const u = await buildUndoSnapshot(entries as never, ak as never);
    assert.equal(u.reversibility, "impossible");
});

test("worst classification wins: clean + lossy (no impossible) => lossy", async () => {
    const ak = {
        request: async (_m: string, path: string) => {
            if (path.includes("/applications/"))
                return {
                    status: 200,
                    data: { results: [{ slug: "exists", name: "Old" }] },
                };

            return { status: 200, data: { results: [] } };
        },
    };
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "exists" },
            attrs: { name: "New" },
        }, // clean
        {
            model: "authentik_core.application",
            identifiers: { slug: "brandnew" },
            attrs: { name: "Brand New" },
        }, // lossy
    ];
    const u = await buildUndoSnapshot(entries as never, ak as never);
    assert.equal(u.reversibility, "lossy");
});

test("snapshot blueprint is valid YAML capturing the CURRENT live state of updates", async () => {
    const ak = {
        request: async () => ({
            status: 200,
            data: {
                results: [
                    {
                        slug: "grafana",
                        name: "Old Name",
                        meta_launch_url: "https://old.example",
                    },
                ],
            },
        }),
    };
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "grafana" },
            attrs: { name: "New Name", meta_launch_url: "https://new.example" },
        },
    ];
    const u = await buildUndoSnapshot(entries as never, ak as never);
    const doc = parse(u.blueprint) as {
        entries: Array<{
            model: string;
            identifiers: Record<string, unknown>;
            attrs: Record<string, unknown>;
        }>;
    };
    assert.ok(Array.isArray(doc.entries));
    const entry = doc.entries[0];
    assert.equal(entry?.model, "authentik_core.application");
    // The restore point captures only the fields the blueprint would have
    // changed, set back to their current (pre-apply) values.
    assert.equal(entry?.attrs.name, "Old Name");
    assert.equal(entry?.attrs.meta_launch_url, "https://old.example");
});

test("only fields the blueprint touches are restored (current values), not the whole object", async () => {
    const ak = {
        request: async () => ({
            status: 200,
            data: {
                results: [
                    {
                        slug: "app",
                        name: "Old",
                        pk: "uuid-1",
                        extra: "leave-me",
                    },
                ],
            },
        }),
    };
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "app" },
            attrs: { name: "New" },
        },
    ];
    const u = await buildUndoSnapshot(entries as never, ak as never);
    const doc = parse(u.blueprint) as {
        entries: Array<{ attrs: Record<string, unknown> }>;
    };
    assert.equal(doc.entries[0]?.attrs.name, "Old");
    assert.equal(doc.entries[0]?.attrs.extra, undefined);
    assert.equal(doc.entries[0]?.attrs.pk, undefined);
});

test("an empty entry list is trivially clean", async () => {
    const ak = {
        request: async () => ({ status: 200, data: { results: [] } }),
    };
    const u = await buildUndoSnapshot([] as never, ak as never);
    assert.equal(u.reversibility, "clean");
    assert.deepEqual(u.notes, []);
});

test("impossible note names the offending object", async () => {
    const ak = {
        request: async () => ({ status: 200, data: { results: [] } }),
    };
    const entries = [
        {
            model: "authentik_sources_oauth.oauthsource",
            state: "absent",
            identifiers: { slug: "myprovider" },
        },
    ];
    const u = await buildUndoSnapshot(entries as never, ak as never);
    assert.ok(u.notes.some((n) => n.includes("myprovider")));
});
