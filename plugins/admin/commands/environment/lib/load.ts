import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { agentEnvPathBuilder } from "./paths.ts";

const envFilePath = agentEnvPathBuilder(".env");

if (existsSync(envFilePath)) {
    console.error(`Loading environment from ${envFilePath}`);

    try {
        loadEnvFile(envFilePath);
    } catch (error) {
        console.warn(`Failed to load environment from ${envFilePath}:`, error);
    }
}
