import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";

export default defineConfig([
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
    }
]);
