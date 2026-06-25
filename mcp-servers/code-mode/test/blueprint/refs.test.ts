import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocument, type Node } from "yaml";

import { checkRef, checkRefAttr, attrValueNode } from "#blueprint/refs";

/** Build a one-entry blueprint and return the AST node for attrs[key]. */
function attrNode(key: string, valueExpr: string): Node | null {
    const doc = parseDocument(
        `version: 1
entries:
  - model: authentik_core.application
    attrs:
      ${key}: ${valueExpr}`,
    );

    return attrValueNode(doc.contents, 0, key);
}

test("checkRef: a !KeyOf must reference an id defined in this blueprint", () => {
    assert.equal(
        checkRef({ tag: "!KeyOf", targetValue: "p" }, new Set(["p"])),
        null,
    );
    assert.match(
        checkRef({ tag: "!KeyOf", targetValue: "p" }, new Set()) ?? "",
        /does not reference/,
    );
});

test("checkRef: curated !Find targets (scope, flow, default key) are permitted", () => {
    const ids = new Set<string>();
    assert.equal(
        checkRef(
            {
                tag: "!Find",
                targetValue: "goauthentik.io/providers/oauth2/scope-openid",
            },
            ids,
        ),
        null,
    );
    assert.equal(
        checkRef(
            { tag: "!Find", targetValue: "default-provider-invalidation-flow" },
            ids,
        ),
        null,
    );
    assert.equal(
        checkRef(
            { tag: "!Find", targetValue: "authentik Self-signed Certificate" },
            ids,
        ),
        null,
    );
});

test("checkRef: excluded scopes and non-curated targets are rejected", () => {
    const ids = new Set<string>();
    assert.match(
        checkRef(
            {
                tag: "!Find",
                targetValue:
                    "goauthentik.io/providers/oauth2/scope-authentik_api",
            },
            ids,
        ) ?? "",
        /excluded scope/,
    );
    assert.match(
        checkRef({ tag: "!Find", targetValue: "some-other-flow" }, ids) ?? "",
        /not permitted/,
    );
});

test("attrValueNode locates a present attr and returns null otherwise", () => {
    assert.ok(attrNode("provider", "!KeyOf p"), "present attr → node");

    const doc = parseDocument(`version: 1
entries:
  - model: authentik_core.application
    attrs: {name: x}`);
    assert.equal(attrValueNode(doc.contents, 0, "provider"), null);
    assert.equal(attrValueNode(doc.contents, 5, "name"), null);
});

test("checkRefAttr: a single permitted reference passes", () => {
    assert.equal(checkRefAttr(attrNode("provider", "!KeyOf p")), null);
    assert.equal(
        checkRefAttr(
            attrNode(
                "authorization_flow",
                "!Find [authentik_flows.flow, [slug, x]]",
            ),
        ),
        null,
    );
});

test("checkRefAttr: a plain literal (or missing node) is rejected", () => {
    assert.match(
        checkRefAttr(attrNode("provider", "some-string")) ?? "",
        /permitted reference/,
    );
    assert.match(checkRefAttr(null) ?? "", /permitted reference/);
});

test("checkRefAttr: a non-permitted tag is rejected", () => {
    assert.match(
        checkRefAttr(attrNode("provider", "!Context x")) ?? "",
        /permitted reference/,
    );
});

test("checkRefAttr: a list of refs passes; a list with a literal fails; an empty list passes", () => {
    assert.equal(
        checkRefAttr(
            attrNode("property_mappings", "[!Find [m, [a, b]], !KeyOf p]"),
        ),
        null,
    );
    assert.match(
        checkRefAttr(
            attrNode("property_mappings", "[!Find [m, [a, b]], plain]"),
        ) ?? "",
        /every reference in the list/,
    );
    assert.equal(checkRefAttr(attrNode("property_mappings", "[]")), null);
});
