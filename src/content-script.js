"use strict";

// Initialize or use existing namespace object
window.aurorisImageConverter = {

    // Get the file name of the image, replace its extension with the format the user requested
    extractFileName: function(url, newExtension) {
        let baseName = url.split('/').pop().split('#')[0].split('?')[0];
        let fileExtension = baseName.lastIndexOf('.') !== -1 ? baseName.substring(baseName.lastIndexOf('.')) : '';
        let fileNameWithoutExtension = fileExtension !== '' ? baseName.replace(fileExtension, '') : baseName;
        return fileNameWithoutExtension + '.' + newExtension;
    },

    // Initiate the download of the converted image file
    initiateDownload: function(dataUrl, fileName) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    // Converts an image file to the requested format (jpg, png), downloads it
    convertImage: function(request, sendResponse) {
        const img = document.createElement('img');
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            let dataUrl, fileExtension;
            if (request.format === 'jpg') {
                dataUrl = canvas.toDataURL('image/jpeg');
                fileExtension = 'jpg';
            } else {
                dataUrl = canvas.toDataURL('image/png');
                fileExtension = 'png';
            }

            let fileName = this.extractFileName(request.imageUrl, fileExtension);

            this.initiateDownload(dataUrl, fileName);
            sendResponse({ success: true });
        };
        img.onerror = () => {
            sendResponse({ error: "Error loading image" });
        };

        img.src = request.imageUrl;
    }
};

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getImage") {
        try {
            window.aurorisImageConverter.convertImage(request, sendResponse);
        } catch (error) {
            sendResponse({ error: error });
        }
        return true; // Indicate an asynchronous response
    }
});