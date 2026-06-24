/** @file In-process code sandbox: only `ak` + `console` are reachable. */

import vm from "node:vm";

/**
 * Run agent code in a constrained vm context.
 *
 * The context object's own properties ARE the sandbox globals — Node builtins
 * (`fetch`, `require`, `process`, `fs`) are absent, so `ak.request` is the only
 * egress. This is not a hardened security boundary against a hostile actor (vm
 * is escapable); the binding is the boundary, per the design's trust model.
 *
 * @param {string} code
 * @param {{ request: Function }} ak
 * @param {{ timeoutMs?: number }} opts
 * @returns {Promise<{ result: unknown, logs: string[] }>}
 */
export async function runInSandbox(code, ak, { timeoutMs = 30000 }) {
    /** @type {string[]} */
    const logs = [];
    /** @param {...unknown} args */
    const record = (...args) =>
        logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    const sandbox = {
        ak,
        console: { log: record, error: record, warn: record, info: record },
    };
    const context = vm.createContext(sandbox);
    const wrapped = `(async () => {\n${code}\n})()`;
    const script = new vm.Script(wrapped, { filename: "agent-code.mjs" });
    const promise = script.runInContext(context, { timeout: timeoutMs });
    const result = await promise;
    // Force a plain serializable value (and surface non-serializable results early).
    return { result: result === undefined ? null : JSON.parse(JSON.stringify(result)), logs };
}
