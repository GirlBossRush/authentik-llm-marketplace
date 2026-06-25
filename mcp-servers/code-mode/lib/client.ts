/** @file Authenticated `ak.request` helper bound into the sandbox. */

import type { AKConfig } from "./config.ts";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const SECRET_REVEAL = /\/(view_key|view_private_key)\/?$/;

/** Endpoints that return a secret value (token key, private key). Blocked even for reads. */
export function isSecretRevealPath(path: string): boolean {
    return SECRET_REVEAL.test(path.replace(/\?.*$/, ""));
}

export interface AkRequestOptions {
    query?: Record<string, string | number>;
    body?: unknown;
}

export interface AkResponse {
    status: number;
    data: unknown;
}

export interface Ak {
    request(
        method: string,
        path: string,
        opts?: AkRequestOptions,
    ): Promise<AkResponse>;
}

export function createAk(
    config: AKConfig,
    { allowWrites }: { allowWrites: boolean },
): Ak {
    async function request(
        method: string,
        path: string,
        opts: AkRequestOptions = {},
    ): Promise<AkResponse> {
        if (isSecretRevealPath(path)) {
            throw new Error(`secret-reveal endpoint blocked: ${path}`);
        }

        const verb = method.toUpperCase();

        if (!allowWrites && !READ_METHODS.has(verb)) {
            throw new Error(
                `writes are not supported (this server is read-only) (attempted ${verb} ${path})`,
            );
        }

        const url = new URL(`${config.baseURL}/api/v3${path}`);

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
            body:
                opts.body === undefined ? undefined : JSON.stringify(opts.body),
        });
        const text = await res.text();
        let data: unknown;

        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = text;
        }

        return { status: res.status, data };
    }

    return { request };
}
