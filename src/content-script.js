"use strict";

// The background script injects this file at most once per frame (its injection guard
// probes for this namespace object), so plain assignment never clobbers a live instance
window.aurorisImageConverter = {

    // Get the file name of the image, replace its extension with the format the user requested
    extractFileName: function(url, newExtension) {
        let baseName = '';
        // data: and blob: URLs have no meaningful file name in them
        if (!/^(data|blob):/i.test(url)) {
            baseName = url.split('#')[0].split('?')[0].split('/').pop();
            try {
                baseName = decodeURIComponent(baseName);
            } catch {
                // Malformed percent-encoding; keep the encoded name
            }
            const dotIndex = baseName.lastIndexOf('.');
            if (dotIndex > 0) {
                baseName = baseName.substring(0, dotIndex);
            }
            // Strip characters that are not valid in file names, keep the name a sane length,
            // and drop leading/trailing dots and spaces so the result is never a hidden file
            baseName = baseName.replace(/[\\/:*?"<>|]/g, '_').substring(0, 96).replace(/^[\s.]+|[\s.]+$/g, '');
        }
        return (baseName || 'image') + '.' + newExtension;
    },

    // Initiate the download of the converted image file
    initiateDownload: function(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        (document.body || document.documentElement).appendChild(a);
        a.click();
        a.remove();
        // Release the blob after the download has had time to start
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    },

    // data:, blob: and same-origin http(s) URLs load as this document's own images. A blob:
    // minted by another origin (possible after the top-frame retry) fails the load cleanly.
    isSameDocumentOrigin: function(imageUrl) {
        try {
            const url = new URL(imageUrl, window.location.href);
            if (url.protocol === 'data:' || url.protocol === 'blob:') {
                return true;
            }
            return url.origin === window.location.origin;
        } catch {
            return false;
        }
    },

    // Draw a pixel source to a canvas, encode it in the requested format and download it
    encodeAndDownload: function(source, width, height, format, nameUrl, sendResponse) {
        if (!width || !height) {
            // Some SVGs have no intrinsic size; toBlob on a 0x0 canvas would yield a null
            // blob, so report the real reason instead of the generic encoding error
            sendResponse({ error: "Image has no intrinsic size" });
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const isJpg = format === 'jpg';
        const ctx = canvas.getContext('2d');
        if (isJpg) {
            // JPEG has no alpha channel; without this, transparent pixels turn black
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(source, 0, 0);

        const mimeType = isJpg ? 'image/jpeg' : 'image/png';
        canvas.toBlob(blob => {
            if (!blob) {
                sendResponse({ error: "Could not encode image as " + mimeType });
                return;
            }
            this.initiateDownload(blob, this.extractFileName(nameUrl, isJpg ? 'jpg' : 'png'));
            sendResponse({ success: true });
        }, mimeType, isJpg ? 0.92 : undefined);
    },

    // Re-load same-origin, data: and blob: images plainly; those never taint the canvas.
    // Cross-origin images are left to the background script, which fetches them directly.
    // No crossOrigin reload is attempted here: CORS requests from this sandbox get no
    // Origin header in Firefox and always fail.
    convert: function(request, sendResponse) {
        if (!this.isSameDocumentOrigin(request.imageUrl)) {
            sendResponse({ needsPermission: true });
            return;
        }

        const img = document.createElement('img');
        img.onload = () => {
            // This runs after the message listener's try/catch has returned; without a
            // response of its own, a throw here (e.g. toBlob's SecurityError on a tainted
            // canvas in an opaque-origin frame) would leave the background waiting forever
            try {
                this.encodeAndDownload(img, img.naturalWidth, img.naturalHeight, request.format,
                    request.imageUrl, sendResponse);
            } catch (error) {
                sendResponse({ error: error instanceof Error ? error.message : String(error) });
            }
        };
        img.onerror = () => {
            sendResponse({ error: "Could not load image" });
        };
        img.src = request.imageUrl;
    },

    // Convert image bytes fetched by the background script (used for cross-origin images).
    // An ImageBitmap decoded from a Blob has no origin, so no taint rules apply.
    convertBlob: function(request, sendResponse) {
        createImageBitmap(request.blob).then(bitmap => {
            this.encodeAndDownload(bitmap, bitmap.width, bitmap.height, request.format,
                request.imageUrl, sendResponse);
            bitmap.close();
        }).catch(() => {
            sendResponse({ error: "Could not decode image" });
        });
    }
};

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "convert" || request.action === "convertBlob") {
        try {
            if (request.action === "convert") {
                window.aurorisImageConverter.convert(request, sendResponse);
            } else {
                window.aurorisImageConverter.convertBlob(request, sendResponse);
            }
        } catch (error) {
            sendResponse({ error: error instanceof Error ? error.message : String(error) });
        }
        return true; // Indicate an asynchronous response
    }
});
