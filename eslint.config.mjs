import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";

export default defineConfig([
    { ignores: ["dist/", "test-results/", "playwright-report/"] },
    js.configs.recommended,
    {
        files: ["src/**/*.js"],
        languageOptions: {
            sourceType: "script",
            globals: {
                ...globals.browser,
                ...globals.webextensions
            }
        }
    },
    {
        files: ["tests/browser/**/*.mjs"],
        languageOptions: { globals: globals.browser }
    },
    {
        files: ["scripts/**/*.mjs", "tests/**/*.mjs", "playwright.config.mjs"],
        languageOptions: {
            sourceType: "module",
            globals: {
                ...globals.node
            }
        }
    }
]);
