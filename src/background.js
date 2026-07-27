// Origins Firefox has persistently granted us, cached here because the click handler
// must consult them synchronously: permissions.contains() is async, and any await
// before permissions.request() voids the user gesture the prompt requires.
let allUrlsGranted = false;
let grantedHosts = new Set();        // exact hosts, from "*://host/*" grants
let grantedHostSuffixes = new Set(); // "example.com" from "*://*.example.com/*" grants
// Hosts the user declined, remembered for the session so we don't nag
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

// The menu only appears on normal web pages; the browser evaluates these patterns itself,
// so restricted schemes (about:, view-source:, other extensions' pages...) never show it.
// Mozilla's few restricted https domains still show it; clicks there fail with a console
// error only, as do all other conversion failures.
const MENU_PATTERNS = ["http://*/*", "https://*/*"];

// Create a parent menu item
browser.contextMenus.create({
    id: "save-image",
    title: browser.i18n.getMessage("saveImageAs"),
    contexts: ["image"],
    documentUrlPatterns: MENU_PATTERNS
});

// Create sub-items under the parent item
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
    // Firefox only shows the permission doorhanger for a synchronous request made inside
    // a user input handler like this one. The request is scoped to the image's host, and
    // Firefox remembers each grant permanently (about:addons > this extension > Permissions).
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
            declinedHosts.delete(imageHost);
        } else if (granted === false) {
            // Conversion still proceeds on the permission-free paths below
            declinedHosts.add(imageHost);
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
        // created frames both fail, varying by Firefox version); retry from the top frame
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
// content script sandbox cannot make CORS requests at all (its expanded principal gets
// no Origin header). With the image's host granted the fetch is exempt from CORS and
// sends cookies; without it, a plain CORS fetch still works on hosts that allow
// anonymous cross-origin use. The ImageBitmap decoded from the bytes has no origin,
// so canvas taint rules never apply on this path.
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
        blob: blob
    }, { frameId: job.frameId });
    if (!result || !result.success) {
        throw new Error((result && result.error) || "Conversion failed");
    }
}

// The content script is only injected on demand, and at most once per frame; navigation
// wipes it with the rest of the document, after which the probe injects it again
function injectContentScriptIfNeeded(tabId, frameId) {
    return browser.tabs.executeScript(tabId, {
        code: "typeof window.aurorisImageConverter !== 'undefined'",
        frameId: frameId,
        runAt: "document_end"
    }).then(results => {
        if (!results || results[0] !== true) {
            return browser.tabs.executeScript(tabId, {
                file: "/content-script.js",
                frameId: frameId,
                runAt: "document_end"
            });
        }
    });
}
