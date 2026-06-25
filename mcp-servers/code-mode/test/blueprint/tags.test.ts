import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "yaml";

import { collectTaggedRefs } from "#blueprint/tags";

/** Parse a YAML snippet and hand collectTaggedRefs the document's root node. */
function walk(yaml: string): ReturnType<typeof collectTaggedRefs> {
    return collectTaggedRefs(parseDocument(yaml).contents);
}

test("extracts the condition value from a curated !Find", () => {
    const { refs, violations } = walk(
        "x: !Find [authentik_flows.flow, [slug, default-provider-invalidation-flow]]",
    );
    assert.deepEqual(violations, []);
    assert.deepEqual(refs, [
        { tag: "!Find", targetValue: "default-provider-invalidation-flow" },
    ]);
});

test("extracts every condition value of a multi-condition !Find", () => {
    const { refs, violations } = walk("x: !Find [m, [a, \"v1\"], [b, \"v2\"]]");
    assert.deepEqual(violations, []);
    assert.deepEqual(
        refs.map((r) => r.targetValue),
        ["v1", "v2"],
    );
});

test("extracts a !KeyOf scalar id", () => {
    const { refs, violations } = walk("x: !KeyOf my-provider");
    assert.deepEqual(violations, []);
    assert.deepEqual(refs, [{ tag: "!KeyOf", targetValue: "my-provider" }]);
});

test("default-denies any tag outside !Find / !KeyOf", () => {
    for (const tag of ["!Context", "!Format", "!Env", "!File", "!FindObject"]) {
        const { refs, violations } = walk(`x: ${tag} whatever`);
        assert.equal(refs.length, 0, `${tag} must extract no ref`);
        assert.ok(
            violations.some((v) => v.includes("not permitted")),
            `${tag} should be rejected`,
        );
    }
});

test("malformed !Find shapes produce a violation and never throw", () => {
    assert.doesNotThrow(() => walk("x: !Find evil"));
    assert.ok(walk("x: !Find evil").violations.length > 0, "scalar !Find");
    assert.ok(walk("x: !Find []").violations.length > 0, "empty !Find");
    assert.ok(walk("x: !Find [only-model]").violations.length > 0, "no cond");
    assert.ok(
        walk("x: !Find [m, scope-openid]").violations.length > 0,
        "scalar condition",
    );
});

test("rejects a tag nested in a !Find model / field / value position", () => {
    assert.ok(
        walk("x: !Find [!Context m, [slug, v]]").violations.some((v) =>
            /model/i.test(v),
        ),
    );
    assert.ok(
        walk("x: !Find [m, [!File f, v]]").violations.some((v) =>
            /field/i.test(v),
        ),
    );
    assert.ok(
        walk("x: !Find [m, [slug, !Context v]]").violations.some((v) =>
            /value/i.test(v),
        ),
    );
});

test("a numeric (non-string) condition value is rejected", () => {
    const { violations } = walk("x: !Find [m, [pk, 999]]");
    assert.ok(violations.some((v) => /scalar string/.test(v)));
});

test("returns empty for null / untagged input, never throws", () => {
    assert.deepEqual(collectTaggedRefs(null), { refs: [], violations: [] });
    assert.deepEqual(walk("x: plain"), { refs: [], violations: [] });
    assert.deepEqual(walk("x: [a, b, c]"), { refs: [], violations: [] });
});
