/** @file Resolve the authentik docs + integrations base URLs from configuration. */

/**
 * Stable-release docs (current).
 */
export const DOCS_CURRENT_ORIGIN = "https://docs.goauthentik.io";
/**
 * Pre-release / next docs — and the default when no version or override is known.
 */
export const DOCS_NEXT_ORIGIN = "https://next.goauthentik.io";
/**
 * Integrations docs — single, unversioned.
 */
export const INTEGRATIONS_ORIGIN = "https://integrations.goauthentik.io";

/** Trim trailing slashes; treat empty/whitespace as unset. */
function normalizeOrigin(value: string | undefined): string | undefined {
    const trimmed = value?.trim();

    return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
}

/** A version string carries a prerelease tag (e.g. "2026.8.0-rc1" → true). */
export function isPrerelease(version: string): boolean {
    return version.includes("-");
}

/**
 * Resolve the docs base URL from environment overrides ONLY (no instance lookup).
 * Precedence: AK_AGENT_DOCS_URL → AK_DOCS_URL → next.goauthentik.io.
 * Used by the offline SessionStart hook.
 */
export function resolveDocsURLFromEnv(
    env: Record<string, string | undefined>,
): string {
    return (
        normalizeOrigin(env.AK_AGENT_DOCS_URL) ??
        normalizeOrigin(env.AK_DOCS_URL) ??
        DOCS_NEXT_ORIGIN
    );
}

/**
 * Resolve the docs base URL, deriving from the instance version when no env
 * override is set. Precedence: AK_AGENT_DOCS_URL → AK_DOCS_URL → (version:
 * prerelease → PRE_RELEASE_ORIGIN/next; stable → CURRENT_RELEASE_ORIGIN/docs) →
 * next.goauthentik.io. Used by the code-mode MCP, which knows the instance version.
 */
export function resolveDocsURL(
    env: Record<string, string | undefined>,
    version?: string,
): string {
    const override =
        normalizeOrigin(env.AK_AGENT_DOCS_URL) ??
        normalizeOrigin(env.AK_DOCS_URL);
    if (override) return override;

    if (version) {
        return isPrerelease(version)
            ? (normalizeOrigin(env.PRE_RELEASE_ORIGIN) ?? DOCS_NEXT_ORIGIN)
            : (normalizeOrigin(env.CURRENT_RELEASE_ORIGIN) ??
                  DOCS_CURRENT_ORIGIN);
    }

    return DOCS_NEXT_ORIGIN;
}

/** Resolve the (single, unversioned) integrations base URL. */
export function resolveIntegrationsURL(
    env: Record<string, string | undefined>,
): string {
    return (
        normalizeOrigin(env.AK_AGENT_INTEGRATIONS_URL) ??
        normalizeOrigin(env.AK_INTEGRATIONS_URL) ??
        INTEGRATIONS_ORIGIN
    );
}
