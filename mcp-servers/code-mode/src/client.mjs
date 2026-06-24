/** @file Authenticated `ak.request` helper bound into the sandbox. */

/** @import { AKConfig } from "./config.mjs" */

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * @param {AKConfig} config
 * @param {{ allowWrites: boolean }} opts
 * @returns {{ request: (method: string, path: string, opts?: { query?: Record<string, string|number>, body?: unknown }) => Promise<{ status: number, data: unknown }> }}
 */
export function createAk(config, { allowWrites }) {
  /**
   * @param {string} method
   * @param {string} path
   * @param {{ query?: Record<string, string|number>, body?: unknown }} [opts]
   */
  async function request(method, path, opts = {}) {
    const verb = method.toUpperCase();
    if (!allowWrites && !READ_METHODS.has(verb)) {
      throw new Error(
        `writes are disabled in this context; use execute_write (attempted ${verb} ${path})`,
      );
    }
    const url = new URL(`${config.baseUrl}/api/v3${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      method: verb,
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data };
  }
  return { request };
}
