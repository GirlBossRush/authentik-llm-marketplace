/** @file The three code-mode tools: search, execute, execute_write. */

import { createHash } from "node:crypto";

import { searchOperations } from "./schema.mjs";
import { createAk } from "./client.mjs";
import { runInSandbox } from "./sandbox.mjs";

/** @import { AKConfig } from "./config.mjs" */

/**
 * @param {{ spec: any, config: AKConfig }} deps
 */
export function createTools({ spec, config }) {
  /** @param {string} code */
  const confirmTokenFor = (code) =>
    createHash("sha256").update(code).digest("hex").slice(0, 8);

  /** @param {{ query: string, limit?: number }} args */
  const search = ({ query, limit }) => ({
    operations: searchOperations(spec, query, limit),
  });

  /** @param {{ code: string }} args */
  const execute = async ({ code }) => {
    const ak = createAk(config, { allowWrites: false });
    return runInSandbox(code, ak, {});
  };

  /** @param {{ code: string, confirm?: string }} args */
  const executeWrite = async ({ code, confirm }) => {
    const token = confirmTokenFor(code);
    if (confirm !== token) {
      return {
        status: "needs_confirmation",
        token,
        preview: code,
        message:
          "This code will run with WRITE access to the authentik instance. " +
          `Re-call execute_write with confirm: "${token}" to run it unchanged.`,
      };
    }
    const ak = createAk(config, { allowWrites: true });
    return runInSandbox(code, ak, {});
  };

  return { search, execute, executeWrite, confirmTokenFor };
}
