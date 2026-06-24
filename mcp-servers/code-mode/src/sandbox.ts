/** @file In-process code sandbox: only `ak` + `console` are reachable. */

import vm from "node:vm";

import type { Ak } from "./client.ts";

export interface SandboxResult {
  result: unknown;
  logs: string[];
}

/**
 * Run agent code in a constrained vm context.
 *
 * The context object's own properties ARE the sandbox globals — Node builtins
 * (`fetch`, `require`, `process`, `fs`) are absent, so `ak.request` is the only
 * egress. This is not a hardened security boundary against a hostile actor (vm
 * is escapable); the binding is the boundary, per the design's trust model.
 */
export async function runInSandbox(
  code: string,
  ak: Ak,
  { timeoutMs = 30000 }: { timeoutMs?: number },
): Promise<SandboxResult> {
  const logs: string[] = [];
  const record = (...args: unknown[]) =>
    logs.push(
      args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" "),
    );
  const sandbox = {
    ak,
    console: { log: record, error: record, warn: record, info: record },
  };
  const context = vm.createContext(sandbox);
  const wrapped = `(async () => {\n${code}\n})()`;
  const script = new vm.Script(wrapped, { filename: "agent-code.ts" });
  const result = await script.runInContext(context, { timeout: timeoutMs });
  // Force a plain serializable value (and surface non-serializable results early).
  return {
    result: result === undefined ? null : JSON.parse(JSON.stringify(result)),
    logs,
  };
}
