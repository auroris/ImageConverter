# ImageConverter Extension

## Introduction

ImageConverter is a browser extension that enables users to right-click on any image on a webpage and save it in a different format (JPG or PNG). It's designed to make image conversion straightforward and efficient, directly within your browser.

### Key Features and Privacy Assurance

- **Ease of Use**: Easily convert images by right-clicking and selecting the desired format for instant conversion and download.
- **Privacy-Focused**: ImageConverter does not read, process, or store any personal data beyond what is necessary for image conversion.
- **No External Server Interaction**: All image processing is done locally within your browser. The extension's only network activity is re-downloading the image being converted from the site that hosts it; nothing is ever sent to the developer or to any third-party service.
- **Required Permissions**: 
  - `"contextMenus"` to integrate with the browser's context menu.
  - `"activeTab"` to access a page only when you invoke the extension there, and only in that tab.
- **Optional Permissions**:
  - Host access is requested on demand and scoped to a single site: the first time you convert an image hosted on a different website (for example a site's image CDN), Firefox asks for access to that host only. Firefox remembers each grant, and you can review or revoke them individually in the Add-ons Manager's Permissions tab. Most conversions never need any grant at all. (`"<all_urls>"` appears under optional permissions in the manifest because it is the umbrella that allows these narrower per-site requests.) If you would rather grant access to every website once and never be asked again, the same Permissions tab offers an "Access your data for all websites" toggle.
  
This extension was developed with user privacy and security top of mind. The extension does not access or collect your browsing data. The manifest also declares Mozilla's data collection permissions as `none`: the extension collects and transmits no data at all.

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

1. Clone the repository: `git clone https://github.com/auroris/ImageConverter.git`
2. Navigate to the project directory: `cd ImageConverter`
3. Install the development dependencies: `npm install`
4. Make your changes in the code. Run `npm run lint` to check them.

### Testing Changes

1. Run `npm start` to launch a temporary Firefox profile with the extension loaded; it reloads automatically as you edit.
2. Alternatively, open Firefox, navigate to `about:debugging`, click "Load Temporary Add-on", and select `src/manifest.json`.
3. Test your changes in the browser.

## License

ImageConverter is released under the MIT License.
