import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const json = path => JSON.parse(read(path));

test("source and npm versions stay in sync", () => {
    const version = json("src/manifest.json").version;
    assert.equal(json("package.json").version, version);
    assert.equal(json("package-lock.json").version, version);
    assert.equal(json("package-lock.json").packages[""].version, version);
});

test("Firefox preserves its manifest and Chromium gets its own service worker and options page", () => {
    const source = json("src/manifest.json");
    assert.deepEqual(json("dist/firefox/manifest.json"), source);
    const chromium = json("dist/chromium/manifest.json");
    assert.equal(chromium.version, source.version);
    assert.equal(chromium.browser_specific_settings, undefined);
    assert.equal(chromium.author, undefined);
    assert.deepEqual(chromium.background, { service_worker: "background.js" });
    assert.deepEqual(chromium.options_ui, { page: "options.html" });
    assert.deepEqual(chromium.permissions, source.permissions);
    assert.deepEqual(chromium.optional_host_permissions, ["<all_urls>"]);
});

test("packages contain runtime assets only and share the conversion code", () => {
    for (const browser of ["firefox", "chromium"]) {
        const expected = ["_locales", "background.js", "content-script.js", "icons", "manifest.json"];
        if (browser === "chromium") expected.push("options.html", "options.js");
        assert.deepEqual(readdirSync(new URL(`dist/${browser}/`, root)).sort(), expected.sort());
        for (const file of ["background.js", "content-script.js"]) {
            assert.equal(read(`dist/${browser}/${file}`), read(`src/${file}`));
        }
        assert.deepEqual(readdirSync(new URL(`dist/${browser}/icons/`, root)).sort(), ["icon-128.png", "icon-48.png", "icon-96.png"]);
        const locales = readdirSync(new URL("src/_locales/", root));
        assert.deepEqual(readdirSync(new URL(`dist/${browser}/_locales/`, root)), locales);
        for (const locale of locales) {
            assert.equal(read(`dist/${browser}/_locales/${locale}/messages.json`), read(`src/_locales/${locale}/messages.json`));
        }
    }
});
