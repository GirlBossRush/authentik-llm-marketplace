/**
 * @file ESLint Configuration
 *
 * @import { Config } from "eslint/config";
 */

import { createESLintPackageConfig } from "@goauthentik/eslint-config";
import stylistic from "@stylistic/eslint-plugin";

import { defineConfig } from "eslint/config";

// @ts-check

/**
 * ESLint configuration for authentik's monorepo.
 * @type {Config[]}
 */
const eslintConfig = defineConfig(
    createESLintPackageConfig({
        parserOptions: {
            tsconfigRootDir: import.meta.dirname,
        },
    }),
    stylistic.configs.customize({
        quotes: "double",
        indent: 4,
        braceStyle: "1tbs",
        arrowParens: true,
        semi: true,
        severity: "warn",
    }),
    {
        rules: {
            "no-console": "off",
            "consistent-return": "off",
            "no-div-regex": "off",
            "no-empty-function": ["error", { allow: ["arrowFunctions"] }],
            "no-param-reassign": "off",
            "@stylistic/operator-linebreak": "off",
            "@stylistic/quote-props": "off",
            // Prettier owns quote style (it switches to single quotes to avoid
            // escaping); keep the stylistic rule from fighting it.
            "@stylistic/quotes": "off",
            "@stylistic/indent-binary-ops": "off",
            "@stylistic/indent": "off",
            "@stylistic/padding-line-between-statements": [
                "error",
                { blankLine: "always", prev: "*", next: "return" },
                { blankLine: "always", prev: "*", next: "for" },
                { blankLine: "always", prev: "*", next: "block-like" },
                { blankLine: "always", prev: "*", next: "return" },
            ],
        },
    },
    {
        rules: {
            "vars-on-top": "off",
        },
        files: ["**/*.d.ts"],
    },
    {
        rules: {
            // Playwright first parameter must be a destructure pattern,
            // even when not referencing any fixtures.
            "no-empty-pattern": "off",
        },
        files: ["**/*.spec.ts", "**/*.test.ts"],
    },
);

export default eslintConfig;
