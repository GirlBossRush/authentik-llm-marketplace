/** @file Environment configuration for the code-mode server. */

export interface AKConfig {
    /** authentik base URL, no trailing slash. */
    baseURL: string;
    /** authentik API token. */
    token: string;
}

const DEFAULT_URL = "http://localhost:9000";

export function loadConfig(env: Record<string, string | undefined>): AKConfig {
    const url = env.AUTHENTIK_URL?.trim() || DEFAULT_URL;
    const token = env.AUTHENTIK_TOKEN?.trim();
    if (!token)
        throw new Error("AUTHENTIK_TOKEN is required (an authentik API token)");

    return { baseURL: url.replace(/\/+$/, ""), token };
}
