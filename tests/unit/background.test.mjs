import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../src/background.js", import.meta.url), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));

async function background({ origins = [], declinedHosts = [], grant = true, chromium = false } = {}) {
    const calls = [];
    const event = () => ({ addListener(fn) { this.fire = fn; } });
    const browser = {
        permissions: {
            getAll: async () => ({ origins }),
            request: args => { calls.push(["request", plain(args)]); return Promise.resolve(grant); },
            onAdded: event(), onRemoved: event()
        },
        storage: { session: {
            get: async () => ({ declinedHosts }),
            set: async args => { calls.push(["store", plain(args)]); }
        } },
        runtime: { onInstalled: event(), onStartup: event() },
        contextMenus: {
            removeAll: async () => { calls.push(["clearMenus"]); },
            create: args => { calls.push(["menu", plain(args)]); },
            onClicked: event()
        },
        i18n: { getMessage: key => key },
        scripting: { executeScript: async args => {
            calls.push(["inject", args]); return [{ result: false }];
        } },
        tabs: { sendMessage: async (...args) => {
            calls.push(["message", ...plain(args)]); return { success: true };
        } }
    };
    if (!chromium) browser.runtime.getBrowserInfo = async () => ({});
    const context = vm.createContext({
        [chromium ? "chrome" : "browser"]: browser, URL, Blob, Uint8Array, btoa,
        console: { error: (...args) => calls.push(["error", ...args]) },
        fetch: async (...args) => {
            calls.push(["fetch", ...plain(args)]);
            return new Response(new Blob(["pixels"], { type: "image/png" }));
        }
    });
    vm.runInContext(source, context);
    await setImmediate();
    return { browser, context, calls };
}

const info = { menuItemId: "save-as-png", srcUrl: "https://cdn.example/image.png", pageUrl: "https://page.example/" };
const tab = { id: 7, url: info.pageUrl };
const job = () => ({ tabId: 7, frameId: 0, format: "png", imageUrl: info.srcUrl });

for (const chromium of [false, true]) {
    test(`creates localized menus with the correct schemes for ${chromium ? "Chromium" : "Firefox"}`, async () => {
        const { browser, calls } = await background({ chromium });
        await browser.runtime.onInstalled.fire();
        assert.equal(calls[0][0], "clearMenus");
        const menus = calls.filter(([name]) => name === "menu").map(([, menu]) => menu);
        assert.deepEqual(menus.map(menu => menu.id), ["save-image", "save-as-png", "save-as-jpg"]);
        assert.equal(menus[0].title, "saveImageAs");
        assert.deepEqual(menus[0].documentUrlPatterns, chromium
            ? ["http://*/*", "https://*/*"] : ["http://*/*", "https://*/*", "file://*/*"]);
    });
}

test("requests only the image host, synchronously during the click", async () => {
    const { browser, calls } = await background();
    browser.contextMenus.onClicked.fire(info, tab);
    assert.deepEqual(calls, [["request", { origins: ["*://cdn.example/*"] }]]);
    await setImmediate();
    assert.equal(calls.filter(([name]) => name === "message").length, 1);
});

test("same-origin, data and blob images never prompt", async () => {
    for (const srcUrl of ["https://page.example/a.png", "data:image/png;base64,AA==", "blob:https://page.example/id"]) {
        const { browser, calls } = await background();
        browser.contextMenus.onClicked.fire({ ...info, srcUrl }, tab);
        await setImmediate();
        assert.equal(calls.some(([name]) => name === "request"), false);
        assert.equal(calls.some(([name]) => name === "message"), true);
    }
});

test("compares an iframe image against the iframe origin", async () => {
    const { context } = await background();
    assert.equal(context.imageHostNeedingPermission({ ...info, frameUrl: "https://cdn.example/frame" }, tab), null);
    assert.equal(context.imageHostNeedingPermission({ ...info, srcUrl: "invalid URL" }, tab), null);
});

test("remembers declines across clicks and background restarts", async () => {
    const { browser, calls } = await background({ grant: false });
    browser.contextMenus.onClicked.fire(info, tab);
    await setImmediate();
    browser.contextMenus.onClicked.fire(info, tab);
    await setImmediate();
    assert.equal(calls.filter(([name]) => name === "request").length, 1);
    assert.deepEqual(calls.find(([name]) => name === "store")[1], { declinedHosts: ["cdn.example"] });
    const restored = await background({ declinedHosts: ["cdn.example"] });
    restored.browser.contextMenus.onClicked.fire(info, tab);
    await setImmediate();
    assert.equal(restored.calls.some(([name]) => name === "request"), false);
});

test("wildcard grants match domain boundaries and permission revocation refreshes the cache", async () => {
    const origins = ["*://*.example.com/*", "*://exact.test/*"];
    const { browser, context } = await background({ origins });
    for (const host of ["example.com", "cdn.example.com", "exact.test"]) assert.equal(context.isHostGranted(host), true);
    for (const host of ["evil-example.com", "example.com.evil.test", "cdn.exact.test"]) assert.equal(context.isHostGranted(host), false);
    origins.length = 0;
    browser.permissions.onRemoved.fire();
    await setImmediate();
    assert.equal(context.isHostGranted("cdn.example.com"), false);
});

test("failed iframe injection retries conversion in the top frame", async () => {
    const { browser, context, calls } = await background();
    browser.scripting.executeScript = async args => {
        calls.push(["inject", args]);
        if (args.target.frameIds[0] !== 0) throw new Error("No frame access");
        return [{ result: false }];
    };
    await context.runConversion({ ...job(), frameId: 9 });
    assert.deepEqual(calls.filter(([name]) => name === "inject").map(([, args]) => args.target.frameIds[0]), [9, 0, 0]);
    assert.deepEqual(calls.find(([name]) => name === "message")[3], { frameId: 0 });
});

test("an already-injected content script is reused", async () => {
    const { browser, context } = await background();
    browser.scripting.executeScript = async args => {
        assert.ok(args.func);
        assert.equal(args.files, undefined);
        return [{ result: true }];
    };
    await context.runConversion(job());
});

for (const granted of [false, true]) {
    test(`background fetch ${granted ? "includes" : "omits"} credentials according to host permission`, async () => {
        const { browser, context, calls } = await background({ origins: granted ? ["*://cdn.example/*"] : [] });
        browser.tabs.sendMessage = async (tabId, message, target) => {
            calls.push(["message", tabId, plain(message), plain(target)]);
            return message.action === "convert" ? { needsPermission: true } : { success: true };
        };
        await context.runConversion(job());
        assert.deepEqual(calls.find(([name]) => name === "fetch")[2], granted
            ? { credentials: "include" } : { mode: "cors", credentials: "omit" });
        const message = calls.filter(([name]) => name === "message").at(-1)[2];
        assert.equal(message.action, "convertBlob");
        assert.equal(message.mimeType, "image/png");
        assert.equal(Buffer.from(message.bytesBase64, "base64").toString(), "pixels");
    });
}

test("ordinary conversion errors do not trigger a network request", async () => {
    const { browser, context, calls } = await background();
    browser.tabs.sendMessage = async () => ({ error: "Could not decode image" });
    await assert.rejects(context.runConversion(job()), /Could not decode image/);
    assert.equal(calls.some(([name]) => name === "fetch"), false);
});

test("failed HTTP requests and missing conversion responses surface errors", async () => {
    const { browser, context } = await background();
    context.fetch = async () => new Response(null, { status: 403 });
    await assert.rejects(context.fetchAndConvert(job()), /status 403/);
    browser.tabs.sendMessage = async () => undefined;
    await assert.rejects(context.runConversion(job()), /No response/);
});

test("large blobs survive chunked base64 encoding", async () => {
    const { context } = await background();
    const bytes = Uint8Array.from({ length: 100000 }, (_, i) => i % 256);
    const encoded = await context.blobToBase64(new Blob([bytes]));
    assert.deepEqual(Buffer.from(encoded, "base64"), Buffer.from(bytes));
});
