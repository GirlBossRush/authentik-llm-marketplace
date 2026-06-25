import { test } from "node:test";
import assert from "node:assert/strict";

import { parseTokenDuration } from "#blueprint/duration";

test("a number is returned verbatim as seconds", () => {
    assert.equal(parseTokenDuration(0), 0);
    assert.equal(parseTokenDuration(3600), 3600);
    // Negative is returned as-is; the caller (the `cap` bin) is what rejects it.
    assert.equal(parseTokenDuration(-5), -5);
});

test("a bare numeric string parses as seconds", () => {
    assert.equal(parseTokenDuration("10"), 10);
    assert.equal(parseTokenDuration("  3600  "), 3600);
});

test("single timedelta units convert to seconds", () => {
    assert.equal(parseTokenDuration("seconds=30"), 30);
    assert.equal(parseTokenDuration("minutes=2"), 120);
    assert.equal(parseTokenDuration("hours=1"), 3600);
    assert.equal(parseTokenDuration("days=1"), 86400);
    assert.equal(parseTokenDuration("weeks=1"), 604800);
});

test("multiple semicolon-separated units sum", () => {
    assert.equal(parseTokenDuration("hours=1;minutes=30"), 5400);
    assert.equal(parseTokenDuration("days=1;hours=12"), 129600);
});

test("empty and trailing segments are tolerated", () => {
    assert.equal(parseTokenDuration("hours=1;"), 3600);
    assert.equal(parseTokenDuration("hours=1;;minutes=1"), 3660);
});

test("an unknown unit rejects the whole value (never silently ignored)", () => {
    assert.equal(parseTokenDuration("fortnights=10"), null);
    assert.equal(parseTokenDuration("hours=1;fortnights=10"), null);
});

test("malformed and non-string/number inputs return null", () => {
    assert.equal(parseTokenDuration(""), null);
    assert.equal(parseTokenDuration("   "), null);
    assert.equal(parseTokenDuration("abc"), null);
    assert.equal(parseTokenDuration("hours=abc"), null);
    assert.equal(parseTokenDuration("hours="), null);
    assert.equal(parseTokenDuration(null), null);
    assert.equal(parseTokenDuration(undefined), null);
    assert.equal(parseTokenDuration(true), null);
    assert.equal(parseTokenDuration({}), null);
});
