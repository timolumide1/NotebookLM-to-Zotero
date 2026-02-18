
# NotebookLM to Zotero - Chrome Extension
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/hclfbmkbjpilkonccfnohilpcbkpkpof)](https://chrome.google.com/webstore/detail/notebooklm-to-zotero/hclfbmkbjpilkonccfnohilpcbkpkpof)
[![Users](https://img.shields.io/chrome-web-store/users/hclfbmkbjpilkonccfnohilpcbkpkpof)](https://chrome.google.com/webstore/detail/notebooklm-to-zotero/hclfbmkbjpilkonccfnohilpcbkpkpof)
```

## Features

✅ **One-Click Export** - Extract all sources from any NotebookLM notebook instantly  
✅ **RIS Format** - Industry-standard format compatible with Zotero and other reference managers  
✅ **Zero Configuration** - No API keys, no setup, just install and use  
✅ **Complete Privacy** - All processing happens locally in your browser  
✅ **Smart Detection** - Automatically identifies web articles, PDFs, YouTube videos, and more  
✅ **Batch Processing** - Export hundreds of sources in seconds  
✅ **Clean Interface** - Beautiful, intuitive design with your research in mind

## Installation

### From Chrome Web Store (Recommended - Coming Soon)
1. Visit the Chrome Web Store
2. Search for "NotebookLM to Zotero"
3. Click "Add to Chrome"
4. Done!

### Manual Installation (For Testing/Development)

1. **Download the Extension**
   - Download this folder or clone the repository
   - Make sure all files are in a folder named `NotebookLM-to-Zotero`

2. **Open Chrome Extensions Page**
   - Open Google Chrome
   - Navigate to `chrome://extensions/`
   - Or click: Menu (⋮) → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked"
   - Select the `NotebookLM-to-Zotero` folder
   - The extension icon should appear in your toolbar

5. **Pin the Extension (Optional)**
   - Click the puzzle piece icon in Chrome toolbar
   - Find "NotebookLM to Zotero"
   - Click the pin icon to keep it visible

## How to Use

### Step 1: Open NotebookLM
1. Go to [notebooklm.google.com](https://notebooklm.google.com)
2. Open any notebook with sources

### Step 2: Export Sources
1. Click the **NotebookLM to Zotero** extension icon in your toolbar
2. Review the source count and breakdown
3. Click **"Export Sources"**
4. Choose where to save the RIS file

### Step 3: Import to Zotero
1. Open Zotero desktop application
2. Go to **File → Import**
3. Select the downloaded `.ris` file
4. Click **Open**
5. Your sources are now in Zotero! 🎉

## What Gets Exported

The extension extracts and exports:

- ✅ **Source titles**
- ✅ **URLs** (for web sources)
- ✅ **Source types** (web, PDF, YouTube, Google Drive, etc.)
- ✅ **Publication dates** (when available)
- ✅ **Metadata tags** (NotebookLM, source type)

## File Format

The extension generates RIS (Research Information Systems) format files, which include:

```
TY  - WEB
TI  - Article Title Here
UR  - https://example.com/article
PY  - 2024
AB  - Source from NotebookLM: My Research Project. Type: web
KW  - NotebookLM
KW  - web
ER  - 
```

RIS is compatible with:
- ✅ Zotero
- ✅ Mendeley
- ✅ EndNote
- ✅ RefWorks
- ✅ Most reference management software

## Troubleshooting

### Extension Icon Not Appearing
- Make sure you're on a NotebookLM page (`notebooklm.google.com`)
- Refresh the page
- Check that the extension is enabled in `chrome://extensions/`

### No Sources Found
- Ensure the notebook actually has sources added
- Try refreshing the NotebookLM page
- Check that sources are fully loaded (not still uploading)

### Export Button Disabled
- The notebook must have at least one source
- Make sure you're on the main notebook view (not in a specific source)

### Download Not Starting
- Check Chrome's download settings
- Ensure downloads are not blocked for this site
- Try a different download location

### Sources Not Importing to Zotero
- Make sure you're using Zotero 6.0 or later
- Verify the RIS file downloaded completely
- Try opening the RIS file in a text editor to verify it's not empty

## Supported Source Types

| Source Type | Detection | Export Quality |
|------------|-----------|----------------|
| Web Articles | ✅ Excellent | Full metadata |
| PDFs | ✅ Good | Title + type |
| YouTube Videos | ✅ Excellent | Title + URL |
| Google Drive Files | ✅ Good | Title + link |
| Google Docs | ✅ Good | Title + metadata |

## Privacy & Security

🔒 **Your data never leaves your browser**
- All source extraction happens locally
- No data is sent to external servers
- No tracking or analytics
- No API keys required
- Open source code you can inspect

## Technical Details

### Architecture
- **Content Script**: Scrapes NotebookLM page DOM
- **Popup UI**: User interface and state management
- **RIS Generator**: Converts sources to RIS format
- **File Downloader**: Triggers browser download

### Permissions Required
- `activeTab` - Access current NotebookLM tab
- `downloads` - Trigger RIS file download
- `storage` - Store user preferences (future feature)
- `notebooklm.google.com` - Access NotebookLM pages

### Browser Compatibility
- ✅ Google Chrome 88+
- ✅ Microsoft Edge 88+
- ✅ Brave Browser
- ✅ Any Chromium-based browser

## Known Limitations

- PDF files without URLs export with title only (no automatic metadata lookup)
- Private Google Drive files may not include full URLs
- Some source types may require manual metadata enhancement in Zotero
- Large notebooks (300+ sources) may take a few seconds to process

## Future Features

Coming soon:
- [ ] Direct Zotero API integration (optional advanced mode)
- [ ] BibTeX export format
- [ ] CSV export for spreadsheet analysis
- [ ] Custom tag/collection assignment
- [ ] Automatic duplicate detection
- [ ] Enhanced metadata extraction

## Support

### Get Help
- Check this README first
- Review the troubleshooting section
- Open an issue on GitHub (if available)
- Contact: [Your contact information]

### Report Bugs
When reporting issues, please include:
1. Chrome version (`chrome://version/`)
2. Extension version
3. Steps to reproduce
4. Screenshot if relevant
5. Console errors (F12 → Console)

## For Educators

This extension is designed for classroom use:

- **Zero setup** - Students just install and use
- **No accounts needed** - No API keys or registration
- **Reliable** - Offline-capable, no external dependencies
- **Privacy-first** - No student data collection
- **Batch-friendly** - Handles hundreds of sources easily

Perfect for:
- Research methods courses
- Literature review assignments
- Citation management training
- Academic writing workshops

## Credits

Built for students and researchers who deserve better tools.

Made with ❤️ for the academic community.

## License

MIT License - Feel free to use, modify, and distribute.

## Version History

### v1.0.0 (2024)
- Initial release
- RIS export functionality
- Support for all major NotebookLM source types
- Clean, intuitive interface
- Zero-configuration setup

---

**Questions? Suggestions? We'd love to hear from you!**

🌟 If this extension helps your research, consider leaving a review!
