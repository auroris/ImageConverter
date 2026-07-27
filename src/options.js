"use strict";

// Firefox exposes the promise-based extension API as `browser`; Chrome only defines
// `chrome`, whose MV3 APIs also return promises when no callback is passed. (This page
// ships only in the Chromium package — Firefox has its own all-websites toggle in
// about:addons — but the alias keeps the file runnable in both browsers.)
globalThis.browser ??= globalThis.chrome;

const ALL_URLS = { origins: ["<all_urls>"] };
const checkbox = document.getElementById("all-sites");

document.getElementById("all-sites-label").textContent = browser.i18n.getMessage("allowAllSites");
document.getElementById("all-sites-note").textContent = browser.i18n.getMessage("allowAllSitesNote");

// Re-reading the real state (rather than trusting the checkbox) keeps the UI honest
// when the user dismisses the prompt, or grants/revokes elsewhere while the page is open
function refresh() {
    browser.permissions.contains(ALL_URLS).then(granted => {
        checkbox.checked = granted;
        checkbox.disabled = false;
    });
}
refresh();
browser.permissions.onAdded.addListener(refresh);
browser.permissions.onRemoved.addListener(refresh);

checkbox.addEventListener("change", () => {
    // request() only shows a prompt when called synchronously inside a user input
    // handler like this one; the browser answers silently if already granted
    const pending = checkbox.checked
        ? browser.permissions.request(ALL_URLS)
        : browser.permissions.remove(ALL_URLS);
    checkbox.disabled = true;
    pending.catch(error => {
        console.error("Image Converter:", error);
    }).then(refresh);
});
