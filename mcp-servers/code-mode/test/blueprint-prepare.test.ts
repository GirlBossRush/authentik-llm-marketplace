import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareApply } from "#blueprint-prepare";

test("invalid blueprint returns violations and no apply artifacts", async () => {
    const r = await prepareApply(
        `version: 1
entries:
  - model: authentik_policies_expression.expressionpolicy
    attrs: {name: x}`,
        {
            request: async () => ({ status: 200, data: { results: [] } }),
        } as never,
    );
    assert.equal(r.ok, false);
    assert.ok(r.violations.length > 0);
    assert.equal(r.diff, undefined);
    assert.equal(r.undo, undefined);
    assert.equal(r.applyCommand, "");
    assert.equal(r.notice, "");
    assert.equal(r.destructive, false);
});

test("valid blueprint yields diff+undo+honest notice, never auto-applies", async () => {
    const ak = {
        request: async () => ({ status: 200, data: { results: [] } }),
    };
    const r = await prepareApply(
        `version: 1
entries:
  - model: authentik_core.application
    attrs: {name: Grafana, slug: grafana}`,
        ak as never,
    );
    assert.equal(r.ok, true);
    assert.ok(r.diff && r.undo);
    assert.match(r.applyCommand, /ak apply_blueprint/);
    assert.match(r.notice, /will not apply|you remain responsible/i);
    assert.equal(r.destructive, false);
});

test("identifiers are derived from entry and passed to diff", async () => {
    // The application's slug is its identifier; diff should report one object.
    const ak = {
        request: async () => ({
            status: 200,
            data: { results: [{ slug: "grafana", name: "Grafana" }] },
        }),
    };
    const r = await prepareApply(
        `version: 1
entries:
  - model: authentik_core.application
    identifiers: {slug: grafana}
    attrs: {name: Grafana, slug: grafana}`,
        ak as never,
    );
    assert.equal(r.ok, true);
    assert.ok(r.diff);
    assert.equal(r.diff!.objects.length, 1);
    assert.equal(r.diff!.objects[0]!.identifier, "slug=grafana");
});

test("destructive entry steers to manual host CLI and omits smooth command", async () => {
    // A `state: absent` entry on an allowed model is mechanically valid but a
    // destructive delete: destructive=true, applyCommand empty, notice steers
    // to the manual host-CLI path.
    const ak = {
        request: async () => ({ status: 200, data: { results: [] } }),
    };
    const r = await prepareApply(
        `version: 1
entries:
  - model: authentik_core.application
    state: absent
    identifiers: {slug: grafana}
    attrs: {name: Grafana, slug: grafana}`,
        ak as never,
    );
    assert.equal(r.ok, true);
    assert.equal(r.destructive, true);
    assert.equal(r.applyCommand, "");
    assert.match(r.notice, /manual|host|CLI/i);
    // The honesty text is still present even for destructive ops.
    assert.match(r.notice, /will not apply|you remain responsible/i);
});

test("notice carries the full honesty text on the happy path", async () => {
    const ak = {
        request: async () => ({ status: 200, data: { results: [] } }),
    };
    const r = await prepareApply(
        `version: 1
entries:
  - model: authentik_core.application
    attrs: {name: Grafana, slug: grafana}`,
        ak as never,
    );
    assert.match(r.notice, /mechanically safe/i);
    assert.match(r.notice, /you remain responsible/i);
    assert.match(r.notice, /will not apply/i);
});
