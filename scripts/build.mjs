// Stages dist/firefox and dist/chromium from src/. The two builds share every file
// except the manifest: src/manifest.json is the Firefox manifest verbatim (so web-ext
// and about:debugging keep working straight from src/), and the Chromium variant is
// derived from it here so the version and everything else have a single source of truth.
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const dist = join(root, "dist");

// Everything that ships besides the manifest; the other files under src/icons are
// website/store artwork that stays out of the packages
const FILES = [
    "background.js",
    "content-script.js",
    "_locales",
    "icons/icon-48.png",
    "icons/icon-96.png",
    "icons/icon-128.png"
];

// The options page only offers an "allow all websites" toggle, which Firefox already
// provides in about:addons, so it ships in the Chromium package alone
const CHROMIUM_FILES = [
    "options.html",
    "options.js"
];

const manifest = JSON.parse(readFileSync(join(src, "manifest.json"), "utf8"));

function emit(browserName, extraFiles, transform) {
    const out = join(dist, browserName);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(join(out, "icons"), { recursive: true });
    for (const file of [...FILES, ...extraFiles]) {
        cpSync(join(src, file), join(out, file), { recursive: true });
    }
    const emitted = structuredClone(manifest);
    transform(emitted);
    writeFileSync(join(out, "manifest.json"), JSON.stringify(emitted, null, 2) + "\n");
}

emit("firefox", [], () => {});

emit("chromium", CHROMIUM_FILES, m => {
    delete m.browser_specific_settings; // gecko-only metadata
    delete m.author;                    // Chrome expects a dictionary here and warns on a string
    m.background = { service_worker: "background.js" };
    m.minimum_chrome_version = "123";   // promise-returning contextMenus calls
    m.options_ui = { page: "options.html" };
});

console.log(`Built dist/firefox and dist/chromium (version ${manifest.version})`);
