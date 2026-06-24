/** @file Environment configuration for the code-mode server. */

/**
 * @typedef {object} AKConfig
 * @property {string} baseUrl authentik base URL, no trailing slash.
 * @property {string} token authentik API token.
 */

/**
 * @param {Record<string, string | undefined>} env
 * @returns {AKConfig}
 */
export function loadConfig(env) {
    const url = env.AUTHENTIK_URL?.trim();
    const token = env.AUTHENTIK_TOKEN?.trim();
    if (!url) throw new Error("AUTHENTIK_URL is required (e.g. https://id.example.com)");
    if (!token) throw new Error("AUTHENTIK_TOKEN is required (an authentik API token)");
    return { baseUrl: url.replace(/\/+$/, ""), token };
}
