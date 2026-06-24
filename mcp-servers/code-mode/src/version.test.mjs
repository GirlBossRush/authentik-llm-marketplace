import { test } from "node:test";
import assert from "node:assert/strict";

import { SERVER_NAME, SERVER_VERSION } from "./version.mjs";

test("server identity constants", () => {
    assert.equal(SERVER_NAME, "authentik-code-mode");
    assert.match(SERVER_VERSION, /^\d+\.\d+\.\d+$/);
});
