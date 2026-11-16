import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const contentScript = fileURLToPath(new URL("../../src/content-script.js", import.meta.url));
const optionsScript = fileURLToPath(new URL("../../src/options.js", import.meta.url));

test.beforeEach(async ({ page, browserName }) => {
    await page.route("https://imageconverter.test/**", route => route.fulfill({
        contentType: "text/html", body: "<!doctype html><html><body></body></html>"
    }));
    await page.goto("https://imageconverter.test/");
    await page.evaluate(name => {
        window[name === "chromium" ? "chrome" : "browser"] = {
            runtime: { onMessage: { addListener(listener) { window.receiveMessage = listener; } } }
        };
    }, browserName);
    await page.addScriptTag({ path: contentScript });
});

async function imageFixture(page) {
    return page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 16;
        const context = canvas.getContext("2d");
        context.fillStyle = "red";
        context.fillRect(0, 0, 8, 16);
        return canvas.toDataURL("image/png");
    });
}

async function send(page, request) {
    return page.evaluate(request => new Promise(resolve => window.receiveMessage(request, {}, resolve)), request);
}

async function verifyDownload(page, download, format) {
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    if (format === "png") expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    else expect([...bytes.subarray(0, 3)]).toEqual([255, 216, 255]);
    const decoded = await page.evaluate(async base64 => {
        const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
        const image = await createImageBitmap(new Blob([bytes]));
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const result = {
            width: image.width, height: image.height,
            red: [...context.getImageData(1, 8, 1, 1).data],
            transparent: [...context.getImageData(14, 8, 1, 1).data]
        };
        image.close();
        return result;
    }, bytes.toString("base64"));
    expect(decoded.width).toBe(16);
    expect(decoded.height).toBe(16);
    expect(decoded.red[0]).toBeGreaterThan(240);
    expect(decoded.red[1]).toBeLessThan(15);
    expect(decoded.red[3]).toBe(255);
    if (format === "png") expect(decoded.transparent[3]).toBe(0);
    else for (const channel of decoded.transparent) expect(channel).toBeGreaterThan(245);
}

for (const format of ["png", "jpg"]) {
    for (const kind of ["same-origin", "data", "blob", "background-bytes"]) {
        test(`downloads ${format} from ${kind} with correct pixels and transparency`, async ({ page }) => {
            const dataUrl = await imageFixture(page);
            let imageUrl = dataUrl;
            if (kind === "same-origin") {
                imageUrl = "https://imageconverter.test/red%20image.webp?size=16#preview";
                await page.route(imageUrl.split("#")[0], route => route.fulfill({
                    contentType: "image/png", body: Buffer.from(dataUrl.split(",")[1], "base64")
                }));
            } else if (kind === "blob") {
                imageUrl = await page.evaluate(async url => URL.createObjectURL(await (await fetch(url)).blob()), dataUrl);
            }
            const request = kind === "background-bytes"
                ? { action: "convertBlob", format, imageUrl: "https://cdn.test/red.png", mimeType: "image/png", bytesBase64: dataUrl.split(",")[1] }
                : { action: "convert", format, imageUrl };
            const pendingDownload = page.waitForEvent("download");
            expect(await send(page, request)).toEqual({ success: true });
            const download = await pendingDownload;
            if (kind === "same-origin") expect(download.suggestedFilename()).toBe(`red image.${format}`);
            await verifyDownload(page, download, format);
        });
    }
}

test("cross-origin conversion asks the background for bytes without loading the remote image", async ({ page }) => {
    const requests = [];
    page.on("request", request => requests.push(request.url()));
    expect(await send(page, { action: "convert", format: "png", imageUrl: "https://cdn.test/picture.png" })).toEqual({ needsPermission: true });
    expect(requests).toEqual([]);
});

test("invalid image bytes and broken image loads return errors", async ({ page }) => {
    expect(await send(page, { action: "convertBlob", format: "png", bytesBase64: "bm90IGFuIGltYWdl", mimeType: "image/png", imageUrl: "bad.png" }))
        .toEqual({ error: "Could not decode image" });
    expect(await send(page, { action: "convert", format: "png", imageUrl: "data:image/png;base64,bm90IGFuIGltYWdl" }))
        .toEqual({ error: "Could not load image" });
});

test("zero-size images and encoding failures report an error instead of downloading", async ({ page }) => {
    const results = await page.evaluate(() => {
        const converter = window.aurorisImageConverter;
        const source = document.createElement("canvas");
        const responses = [];
        converter.encodeAndDownload(source, 0, 0, "png", "image.png", result => responses.push(result));
        HTMLCanvasElement.prototype.toBlob = callback => callback(null);
        converter.encodeAndDownload(source, 1, 1, "png", "image.png", result => responses.push(result));
        return responses;
    });
    expect(results).toEqual([{ error: "Image has no intrinsic size" }, { error: "Could not encode image as image/png" }]);
});

test("filenames handle URL suffixes, escapes, invalid characters and unnamed images", async ({ page }) => {
    const cases = [
        ["https://example.test/photo.webp?size=1#preview", "photo.png"],
        ["https://example.test/my%20photo.jpeg", "my photo.png"],
        ["https://example.test/a%2Fb%3Ac.webp", "a_b_c.png"],
        ["https://example.test/%E0%A4%A.png", "%E0%A4%A.png"],
        ["https://example.test/.hidden", "hidden.png"],
        ["https://example.test/", "image.png"],
        ["data:image/png;base64,AA==", "image.png"],
        ["blob:https://example.test/id", "image.png"],
        [`https://example.test/${"a".repeat(120)}.jpg`, `${"a".repeat(96)}.png`]
    ];
    for (const [url, expected] of cases) {
        expect(await page.evaluate(url => window.aurorisImageConverter.extractFileName(url, "png"), url)).toBe(expected);
    }
});

test("the all-sites option reflects declined prompts, grants and external revocation", async ({ page }) => {
    await page.setContent('<input type="checkbox" id="all-sites" disabled><span id="all-sites-label"></span><p id="all-sites-note"></p>');
    await page.evaluate(() => {
        window.granted = false;
        window.acceptPrompt = false;
        window.permissionCalls = [];
        window.browser.permissions = {
            contains: async () => window.granted,
            request: args => {
                window.permissionCalls.push(args);
                window.granted = window.acceptPrompt;
                return Promise.resolve(window.granted);
            },
            remove: async () => { window.granted = false; return true; },
            onAdded: { addListener(fn) { window.permissionAdded = fn; } },
            onRemoved: { addListener(fn) { window.permissionRemoved = fn; } }
        };
        window.browser.i18n = { getMessage: key => key };
    });
    await page.addScriptTag({ path: optionsScript });
    const checkbox = page.locator("#all-sites");
    await expect(checkbox).toBeEnabled();
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    await expect(checkbox).toBeEnabled();
    await page.evaluate(() => { window.acceptPrompt = true; });
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    expect(await page.evaluate(() => window.permissionCalls)).toEqual([
        { origins: ["<all_urls>"] }, { origins: ["<all_urls>"] }
    ]);
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    await page.evaluate(() => { window.granted = true; window.permissionAdded(); });
    await expect(checkbox).toBeChecked();
    await page.evaluate(() => { window.granted = false; window.permissionRemoved(); });
    await expect(checkbox).not.toBeChecked();
});
