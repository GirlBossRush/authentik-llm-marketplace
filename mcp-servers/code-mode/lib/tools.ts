/** @file The three code-mode tools: search, execute, validate. */

import type { OpenAPIV3 } from "openapi-types";

import {
    validateBlueprint,
    type BlueprintValidation,
} from "./blueprint-validate.ts";
import { createAk } from "./client.ts";
import type { AKConfig } from "./config.ts";
import { runInSandbox, type SandboxResult } from "./sandbox.ts";
import { searchOperations, type OperationHit } from "./schema.ts";

export interface CreateToolsDeps {
    spec: OpenAPIV3.Document;
    config: AKConfig;
}

export function createTools({ spec, config }: CreateToolsDeps) {
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

    const validate = ({ content }: { content: string }): BlueprintValidation =>
        validateBlueprint(content);

    return { search, execute, validate };
}
