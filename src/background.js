// Create a parent menu item
browser.contextMenus.create({
    id: "save-image",
    title: "Save Image As...",
    contexts: ["image"]
});

// Create sub-items under the parent item
browser.contextMenus.create({
    id: "save-as-png",
    parentId: "save-image",
    title: "PNG",
    contexts: ["image"]
});

browser.contextMenus.create({
    id: "save-as-jpg",
    parentId: "save-image",
    title: "JPG",
    contexts: ["image"]
});

// When the user clicks the context menu item
browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "save-as-png" || info.menuItemId === "save-as-jpg") {
        // First check if the content script is already injected
        injectContentScriptIfNeeded(tab).then(() => {
            // Once ensured the script is injected, send the message
            browser.tabs.sendMessage(tab.id, {
                action: "getImage",
                format: info.menuItemId.split('-').pop(),
                imageUrl: info.srcUrl
            }).then(handleResponse).catch(handleError);
        });
    }
});

function injectContentScriptIfNeeded(tab) {
    return browser.tabs.executeScript(tab.id, {
        code: "typeof window.aurorisImageConverter !== 'undefined'",
        runAt: "document_end"
    }).then(results => {
        if (!results || results[0] !== true) {
            // Inject the content script
            return browser.tabs.executeScript(tab.id, {
                file: "/content-script.js",
                runAt: "document_end"
            });
        }
    });
}

// No response handling needed
function handleResponse(response) {
    console.debug(response);
}

// Programmer debugging
function handleError(error) {
    console.log(`Error: ${error}`);
}