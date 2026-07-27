# ImageConverter Extension

## Introduction

ImageConverter is a browser extension for Firefox, Chrome and Edge that enables users to right-click on any image on a webpage and save it in a different format (JPG or PNG). It's designed to make image conversion straightforward and efficient, directly within your browser.

### Key Features and Privacy Assurance

- **Ease of Use**: Easily convert images by right-clicking and selecting the desired format for instant conversion and download.
- **Privacy-Focused**: ImageConverter does not read, process, or store any personal data beyond what is necessary for image conversion.
- **No External Server Interaction**: All image processing is done locally within your browser. The extension's only network activity is re-downloading the image being converted from the site that hosts it; nothing is ever sent to the developer or to any third-party service.
- **Required Permissions**: 
  - `"contextMenus"` to integrate with the browser's context menu.
  - `"activeTab"` to access a page only when you invoke the extension there, and only in that tab.
  - `"scripting"` to run the conversion code in that page, again only when you invoke the extension.
  - `"storage"` to remember, for the current browser session only, sites where you declined host access so you aren't asked again.
- **Optional Permissions**:
  - Host access is requested on demand and scoped to a single site: the first time you convert an image hosted on a different website (for example a site's image CDN), your browser asks for access to that host only. Each grant is remembered, and you can review or revoke them individually — in Firefox under the Add-ons Manager's Permissions tab, in Chrome/Edge on the extension's details page. Most conversions never need any grant at all. (`"<all_urls>"` appears under optional host permissions in the manifest because it is the umbrella that allows these narrower per-site requests.) If you would rather grant access to every website once and never be asked again, Firefox offers an "Access your data for all websites" toggle on that same Permissions tab; in Chrome/Edge the equivalent toggle is on the extension's options page (details page > "Extension options").
  
This extension was developed with user privacy and security top of mind. The extension does not access or collect your browsing data. The Firefox manifest also declares Mozilla's data collection permissions as `none`: the extension collects and transmits no data at all.

## Installation

### Firefox

1. Visit the ImageConverter page on the [Firefox Add-ons store](https://addons.mozilla.org/firefox/addon/image-converter/).
2. Click "Add to Firefox" to install the extension.

### Chrome / Edge

Store listings are not yet published. Until then:

1. Download `ImageConverter-chromium-<version>.zip` from the [GitHub Releases page](https://github.com/auroris/ImageConverter/releases) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`), enable Developer mode, click "Load unpacked", and select the unzipped folder.

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

`src/` is a single MV3 codebase for all supported browsers; `src/manifest.json` is the Firefox manifest and the Chromium one is derived from it. `npm run build` stages the two installable packages in `dist/firefox` and `dist/chromium` (the release workflow zips exactly these), and pushes to `main` publish both zips as a GitHub release.

### Testing Changes

Firefox:

1. Run `npm start` to launch a temporary Firefox profile with the extension loaded; it reloads automatically as you edit.
2. Alternatively, open Firefox, navigate to `about:debugging`, click "Load Temporary Add-on", and select `src/manifest.json`.

Chrome / Edge:

1. Run `npm run build`, open `chrome://extensions` (or `edge://extensions`), enable Developer mode, click "Load unpacked", and select `dist/chromium`. Re-run the build and click the reload button on the extension after edits.
2. Alternatively, `npm run start:chromium` launches a browser via web-ext. Note that recent stable Chrome releases ignore the `--load-extension` flag web-ext relies on; if the extension doesn't appear, use "Load unpacked" instead, or point web-ext at a Chromium or Chrome for Testing binary with `--chromium-binary`.

## License

ImageConverter is released under the MIT License.
