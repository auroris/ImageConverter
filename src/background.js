// Firefox exposes the promise-based extension API as `browser`; Chrome only defines
// `chrome`, whose MV3 APIs also return promises when no callback is passed
globalThis.browser ??= globalThis.chrome;

// Origins the browser has persistently granted us, cached here because the click handler
// must consult them synchronously: permissions.contains() is async, and any await
// before permissions.request() voids the user gesture the prompt requires.
let allUrlsGranted = false;
let grantedHosts = new Set();        // exact hosts, from "*://host/*" grants
let grantedHostSuffixes = new Set(); // "example.com" from "*://*.example.com/*" grants
// Hosts the user declined, remembered for the session so we don't nag. Mirrored in
// storage.session because the MV3 background is torn down after a few idle seconds;
// the in-memory copy exists for the same synchronous-consultation reason as above.
const declinedHosts = new Set();

function refreshPermissionState() {
    browser.permissions.getAll().then(permissions => {
        allUrlsGranted = false;
        grantedHosts = new Set();
        grantedHostSuffixes = new Set();
        for (const origin of (permissions.origins || [])) {
            if (origin === "<all_urls>" || origin === "*://*/*") {
                allUrlsGranted = true;
                continue;
            }
            const match = /^[^:]+:\/\/(\*\.)?([^/]+)\//.exec(origin);
            if (match) {
                if (match[1]) {
                    grantedHostSuffixes.add(match[2]);
                } else {
                    grantedHosts.add(match[2]);
                }
            }
        }
    });
}
refreshPermissionState();
browser.permissions.onAdded.addListener(refreshPermissionState);
browser.permissions.onRemoved.addListener(refreshPermissionState);

browser.storage.session.get({ declinedHosts: [] }).then(items => {
    for (const host of items.declinedHosts) {
        declinedHosts.add(host);
    }
});

function setHostDeclined(host, declined) {
    if (declined) {
        declinedHosts.add(host);
    } else {
        declinedHosts.delete(host);
    }
    browser.storage.session.set({ declinedHosts: [...declinedHosts] });
}

function isHostGranted(hostname) {
    if (allUrlsGranted || grantedHosts.has(hostname)) {
        return true;
    }
    for (const suffix of grantedHostSuffixes) {
        if (hostname === suffix || hostname.endsWith("." + suffix)) {
            return true;
        }
    }
    return false;
}

// The menu only appears where conversion stands a chance; the browser evaluates these
// patterns itself, so restricted schemes (about:, view-source:, other extensions' pages...)
// never show it. The browsers' few restricted domains still show it; clicks there fail
// with a console error only, as do all other conversion failures.
const MENU_PATTERNS = ["http://*/*", "https://*/*"];

// Firefox treats each local file as its own origin but keeps a file same-origin with
// itself, so an image opened directly (the document is the image) re-loads untainted and
// converts; a local page embedding some other local file still fails as above. Chromium
// isolates file: URLs with no self exception: it refuses even the same-URL re-load, its
// MV3 background cannot fetch file: URLs, and the case that would work (a local page with
// http(s) images) sits behind the per-extension file-access toggle, so the menu stays off
// there. getBrowserInfo exists only in Firefox.
if (browser.runtime.getBrowserInfo) {
    MENU_PATTERNS.push("file://*/*");
}

// Registered menus outlive the MV3 background script (both browsers persist them), so
// they are created on install/update and browser startup — which also refreshes the
// titles' locale — rather than on every wake-up, where re-creating would raise
// duplicate-id errors. removeAll() first makes the whole thing idempotent.
function createMenus() {
    return browser.contextMenus.removeAll().then(() => {
        browser.contextMenus.create({
            id: "save-image",
            title: browser.i18n.getMessage("saveImageAs"),
            contexts: ["image"],
            documentUrlPatterns: MENU_PATTERNS
        });

        browser.contextMenus.create({
            id: "save-as-png",
            parentId: "save-image",
            title: browser.i18n.getMessage("png"),
            contexts: ["image"],
            documentUrlPatterns: MENU_PATTERNS
        });

        browser.contextMenus.create({
            id: "save-as-jpg",
            parentId: "save-image",
            title: browser.i18n.getMessage("jpg"),
            contexts: ["image"],
            documentUrlPatterns: MENU_PATTERNS
        });
    });
}
browser.runtime.onInstalled.addListener(createMenus);
browser.runtime.onStartup.addListener(createMenus);

// When the user clicks the context menu item
browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== "save-as-png" && info.menuItemId !== "save-as-jpg") {
        return;
    }
    const job = {
        tabId: tab.id,
        frameId: info.frameId || 0,
        format: info.menuItemId.split('-').pop(),
        imageUrl: info.srcUrl
    };
    // Both browsers only honor a permission prompt for a synchronous request made inside
    // a user input handler like this one. The request is scoped to the image's host and
    // each grant is remembered permanently (Firefox: about:addons > this extension >
    // Permissions; Chrome: the extension's details page). A click that wakes the
    // background script can outrun the async cache priming above; the cost is only a
    // redundant request, which the browser answers silently for an already-granted host.
    let prompt = null;
    const imageHost = imageHostNeedingPermission(info, tab);
    if (imageHost && !isHostGranted(imageHost) && !declinedHosts.has(imageHost)) {
        // request() rejects on ordinary failure but throws synchronously when the origin
        // is not a valid match pattern (e.g. an IPv6 literal host); either way, log it
        // and fall through to the permission-free conversion paths
        try {
            prompt = browser.permissions.request({ origins: ["*://" + imageHost + "/*"] }).catch(error => {
                console.error("Image Converter: permission request failed:", error);
                return null;
            });
        } catch (error) {
            console.error("Image Converter: permission request failed:", error);
        }
    }
    Promise.resolve(prompt).then(granted => {
        if (granted === true) {
            grantedHosts.add(imageHost);
            setHostDeclined(imageHost, false);
        } else if (granted === false) {
            // Conversion still proceeds on the permission-free paths below
            setHostDeclined(imageHost, true);
        }
        return runConversion(job);
    }).catch(error => {
        console.error("Image Converter:", error);
    });
});

// The host of a cross-origin http(s) image, which may need a host permission to read;
// null for data:, blob: and same-origin images, which never do
function imageHostNeedingPermission(info, tab) {
    try {
        const src = new URL(info.srcUrl);
        if (src.protocol !== "http:" && src.protocol !== "https:") {
            return null;
        }
        const doc = new URL(info.frameUrl || info.pageUrl || (tab && tab.url) || "");
        return src.origin === doc.origin ? null : src.hostname;
    } catch {
        // Unparseable URLs will fail conversion anyway; don't bother the user first
        return null;
    }
}

async function runConversion(job) {
    try {
        await injectContentScriptIfNeeded(job.tabId, job.frameId);
    } catch (error) {
        if (!job.frameId) {
            throw error;
        }
        // activeTab does not reliably cover subframes (cross-origin and dynamically
        // created frames both fail, varying by browser and version); retry from the
        // top frame
        job.frameId = 0;
        await injectContentScriptIfNeeded(job.tabId, 0);
    }

    const result = await browser.tabs.sendMessage(job.tabId, {
        action: "convert",
        format: job.format,
        imageUrl: job.imageUrl
    }, { frameId: job.frameId });

    if (!result) {
        throw new Error("No response from content script");
    }
    if (result.success) {
        return;
    }
    if (!result.needsPermission) {
        throw new Error(result.error || "Conversion failed");
    }
    await fetchAndConvert(job);
}

// Cross-origin images are fetched here and converted from the raw bytes, because the
// content script cannot reliably make CORS requests (Firefox's sandbox sends no Origin
// header; Chrome subjects it to the page's origin and CSP). With the image's host
// granted the fetch is exempt from CORS and sends cookies; without it, a plain CORS
// fetch still works on hosts that allow anonymous cross-origin use. The bytes cross to
// the content script as base64, because Chrome's message passing only carries JSON.
async function fetchAndConvert(job) {
    let privileged = false;
    try {
        privileged = isHostGranted(new URL(job.imageUrl).hostname);
    } catch {
        // Leave privileged false and let the plain CORS fetch try its luck
    }
    const options = privileged
        ? { credentials: "include" }
        : { mode: "cors", credentials: "omit" };
    const response = await fetch(job.imageUrl, options);
    if (!response.ok) {
        throw new Error("Image request failed with status " + response.status);
    }
    const blob = await response.blob();
    const result = await browser.tabs.sendMessage(job.tabId, {
        action: "convertBlob",
        format: job.format,
        imageUrl: job.imageUrl,
        mimeType: blob.type,
        bytesBase64: await blobToBase64(blob)
    }, { frameId: job.frameId });
    if (!result || !result.success) {
        throw new Error((result && result.error) || "Conversion failed");
    }
}

// Chunked so String.fromCharCode never gets more arguments than the stack allows.
// (Chrome caps extension messages at ~64 MB; base64 of any realistic image fits.)
async function blobToBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

// The content script is only injected on demand, and at most once per frame; navigation
// wipes it with the rest of the document, after which the probe injects it again
async function injectContentScriptIfNeeded(tabId, frameId) {
    const target = { tabId: tabId, frameIds: [frameId] };
    const probe = await browser.scripting.executeScript({
        target: target,
        func: () => typeof window.aurorisImageConverter !== "undefined"
    });
    if (!probe || !probe[0] || probe[0].result !== true) {
        await browser.scripting.executeScript({
            target: target,
            files: ["content-script.js"]
        });
    }
}
