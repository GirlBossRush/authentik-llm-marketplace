import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { fetchSchema } from "#load-schema";

test("fetchSchema GETs /api/v3/schema/ and returns a deref'd spec", async () => {
    const server = createServer((req, res) => {
        assert.equal(req.url, "/api/v3/schema/");
        assert.equal(req.headers.authorization, "Bearer t");

        res.setHeader("content-type", "application/json");
        res.end(
            JSON.stringify({
                openapi: "3.0.3",
                paths: {
                    "/core/users/": {
                        get: {
                            operationId: "core_users_list",
                            summary: "List users",
                        },
                    },
                },
                components: {},
            }),
        );
    });

    await new Promise<void>((r) => server.listen(0, () => r()));

    try {
        const { port } = server.address() as AddressInfo;
        const spec = await fetchSchema({
            baseUrl: `http://127.0.0.1:${port}`,
            token: "t",
        });
        assert.equal(
            spec.paths["/core/users/"]?.get?.operationId,
            "core_users_list",
        );
    } finally {
        server.close();
    }
});
