# ImageConverter Extension

## Introduction

ImageConverter is a browser extension that enables users to right-click on any image on a webpage and save it in a different format (JPG or PNG). It's designed to make image conversion straightforward and efficient, directly within your browser.

### Key Features and Privacy Assurance

- **Ease of Use**: Easily convert images by right-clicking and selecting the desired format for instant conversion and download.
- **Privacy-Focused**: ImageConverter does not read, process, or store any personal data beyond what is necessary for image conversion.
- **No External Server Interaction**: All image processing is done locally within your browser. The extension does not communicate with any remote servers for its functionality.
- **Required Permissions**: 
  - `"contextMenus"` to integrate with the browser's context menu.
  - `"activeTab"` to access the current tab when you interact with the extension.
  - `"<all_urls>"` to allow image manipulation regardless of the source website, necessary to bypass CORS (Cross-Origin Resource Sharing) restrictions. This permission is essential for the extension to access and convert images from any website.
  
We are committed to user privacy and security. The extension requires the `"<all_urls>"` permission strictly for accessing images across different websites for conversion purposes. It does not use this permission to access or collect your browsing data.

## Installation

### From Firefox Add-ons Store

1. Visit the ImageConverter page on the [Firefox Add-ons store](https://addons.mozilla.org/firefox/addon/image-converter/).
2. Click "Add to Firefox" to install the extension.

## Usage

After installing ImageConverter, simply right-click on any image in your browser and select "Save Image As...". You will then see options to save the image as either JPG or PNG. Choose your desired format, and the image will be converted and downloaded to your computer.

## Contributing

Contributions to ImageConverter are welcome! If you have ideas for improvement or have found a bug, please open an issue or submit a pull request.

### Development Setup

To set up the development environment for ImageConverter:

1. Clone the repository: `git clone https://github.com/your-username/imageconverter.git`
2. Navigate to the project directory: `cd imageconverter`
3. Make your changes in the code.

### Testing Changes

1. Open Firefox and navigate to `about:debugging`.
2. Click "Load Temporary Add-on" and select the `manifest.json` file from your project directory.
3. Test your changes in the browser.

## License

ImageConverter is released under the MIT License.
