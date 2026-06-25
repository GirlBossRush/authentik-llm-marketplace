import { test } from "node:test";
import assert from "node:assert/strict";

import {
    findLiveObject,
    formatIdentifier,
    type ParsedEntry,
} from "#blueprint/live-lookup";
import type { Ak } from "#client";

/** A fake read client returning a canned response and recording its calls. */
function fakeAk(response: { status: number; data: unknown }): {
    ak: Ak;
    calls: { method: string; path: string }[];
} {
    const calls: { method: string; path: string }[] = [];
    const ak: Ak = {
        request: async (method, path) => {
            calls.push({ method, path });

            return response;
        },
    };

    return { ak, calls };
}

const APP: ParsedEntry = {
    model: "authentik_core.application",
    identifiers: { slug: "grafana" },
};

test("formatIdentifier renders a stable, key-sorted string", () => {
    assert.equal(formatIdentifier({ slug: "a", name: "b" }), "name=b,slug=a");
    assert.equal(formatIdentifier({}), "");
});

test("findLiveObject: a matching object on the page is `found`", async () => {
    const { ak, calls } = fakeAk({
        status: 200,
        data: { results: [{ slug: "grafana", pk: 1 }] },
    });
    const r = await findLiveObject(APP, ak);
    assert.equal(r.kind, "found");
    assert.deepEqual(r.kind === "found" ? r.live : null, {
        slug: "grafana",
        pk: 1,
    });
    assert.equal(calls[0]?.path, "/core/applications/");
});

test("findLiveObject: a 200 with no match over a complete page is `absent`", async () => {
    const { ak } = fakeAk({
        status: 200,
        data: { results: [{ slug: "other" }] },
    });
    const r = await findLiveObject(APP, ak);
    assert.equal(r.kind, "absent");
});

test("findLiveObject: a non-200 read is `unconfirmed`", async () => {
    const { ak } = fakeAk({ status: 403, data: null });
    const r = await findLiveObject(APP, ak);
    assert.equal(r.kind, "unconfirmed");
});

test("findLiveObject: an unmapped model is `unconfirmed` and never calls the API", async () => {
    const { ak, calls } = fakeAk({ status: 200, data: {} });
    const r = await findLiveObject(
        { model: "authentik_core.group", identifiers: {} },
        ak,
    );
    assert.equal(r.kind, "unconfirmed");
    assert.equal(calls.length, 0);
});

test("findLiveObject: a truncated wide-fetch page with no match is `unconfirmed`", async () => {
    const { ak } = fakeAk({
        status: 200,
        data: { results: [{ name: "other" }], pagination: { next: 2 } },
    });
    const r = await findLiveObject(
        {
            model: "authentik_providers_oauth2.oauth2provider",
            identifiers: { name: "grafana" },
        },
        ak,
    );
    assert.equal(r.kind, "unconfirmed");
});
