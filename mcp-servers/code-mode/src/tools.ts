/** @file The three code-mode tools: search, execute, execute_write. */

import { createHash } from "node:crypto";

import { createAk } from "./client.ts";
import type { AKConfig } from "./config.ts";
import { runInSandbox, type SandboxResult } from "./sandbox.ts";
import { searchOperations, type OperationHit } from "./schema.ts";

export interface CreateToolsDeps {
  spec: any;
  config: AKConfig;
}

export interface WriteConfirmation {
  status: "needs_confirmation";
  token: string;
  preview: string;
  message: string;
}

export function createTools({ spec, config }: CreateToolsDeps) {
  const confirmTokenFor = (code: string): string =>
    createHash("sha256").update(code).digest("hex").slice(0, 8);

  const search = ({
    query,
    limit,
  }: {
    query: string;
    limit?: number;
  }): { operations: OperationHit[] } => ({
    operations: searchOperations(spec, query, limit),
  });

  const execute = async ({
    code,
  }: {
    code: string;
  }): Promise<SandboxResult> => {
    const ak = createAk(config, { allowWrites: false });
    return runInSandbox(code, ak, {});
  };

  const executeWrite = async ({
    code,
    confirm,
  }: {
    code: string;
    confirm?: string;
  }): Promise<SandboxResult | WriteConfirmation> => {
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
