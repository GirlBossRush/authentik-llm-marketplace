/** @file Environment configuration for the code-mode server. */

export interface AKConfig {
    /** authentik base URL, no trailing slash. */
    baseUrl: string;
    /** authentik API token. */
    token: string;
}

export function loadConfig(env: Record<string, string | undefined>): AKConfig {
    const url = env.AUTHENTIK_URL?.trim();
    const token = env.AUTHENTIK_TOKEN?.trim();
    if (!url)
        throw new Error(
            "AUTHENTIK_URL is required (e.g. https://id.example.com)",
        );
    if (!token)
        throw new Error("AUTHENTIK_TOKEN is required (an authentik API token)");
    return { baseUrl: url.replace(/\/+$/, ""), token };
}
