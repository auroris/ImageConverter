import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/browser",
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    use: { headless: true, trace: "retain-on-failure" },
    projects: [
        { name: "chromium", use: { browserName: "chromium" } },
        { name: "firefox", use: { browserName: "firefox" } }
    ]
});
