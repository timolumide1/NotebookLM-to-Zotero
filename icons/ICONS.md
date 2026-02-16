# Extension Icons

The extension requires three icon sizes:
- `icon16.png` (16x16 pixels) - Toolbar icon
- `icon48.png` (48x48 pixels) - Extension management page
- `icon128.png` (128x128 pixels) - Chrome Web Store listing

## Quick Solution: Use an Icon Generator

### Option 1: Online Icon Generator (Easiest)
1. Go to https://www.favicon-generator.org/
2. Upload a logo or image (512x512 recommended)
3. Generate and download all sizes
4. Rename files to match requirements above
5. Place in the `icons/` folder

### Option 2: Design Custom Icons

**Recommended Design:**
- Background: Gradient from #354F6D to #4279BB
- Icon: White "NZ" letters (NotebookLM → Zotero)
- OR: Simple book/document icon in white
- OR: Arrow symbol (→) showing transfer concept

**Design Tools:**
- Canva (free, easy): https://www.canva.com
- Figma (free, professional): https://www.figma.com
- Photoshop/GIMP (advanced)

### Option 3: Use Placeholder Icons Temporarily

For testing purposes, you can use emoji or simple colored squares:

**Simple colored square (using code):**
```javascript
// This won't work directly, but you can use online tools to create:
// 16x16, 48x48, 128x128 solid color (#4279BB) squares
```

**Or download from:**
- https://placeholder.com/
- Generate: `https://via.placeholder.com/128x128/4279BB/FFFFFF?text=NZ`

## Icon Design Specifications

### Color Scheme
- Primary: #354F6D (dark blue)
- Accent: #4279BB (medium blue)
- Highlight: #F28E14 (orange)
- Text/Icon: #FFFFFF (white)

### Design Guidelines
- Keep it simple and recognizable
- Ensure visibility at 16x16 pixels
- Use high contrast for small sizes
- Avoid fine details that won't show at small sizes
- Match the extension's color scheme

### Example Design Concept

**Simple Icon Design:**
```
┌─────────────┐
│             │
│   N → Z     │  ← Letters indicating NotebookLM to Zotero
│             │
└─────────────┘
Background: Gradient #354F6D to #4279BB
Text: White (#FFFFFF)
```

**Alternative Design:**
```
┌─────────────┐
│   ┌───┐     │
│   │ ▶ │ →   │  ← Document with arrow
│   └───┘     │
└─────────────┘
```

## File Structure

Once you have icons, place them in this structure:

```
NotebookLM-to-Zotero/
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
```

## Testing Icons

After adding icons:
1. Reload extension in `chrome://extensions/`
2. Check toolbar icon (should be 16x16)
3. Check extension management page (should be 48x48)
4. Icons should be clear and recognizable at all sizes

## Temporary Solution

If you need to test the extension immediately without proper icons:

1. Create a simple 128x128 PNG with your color scheme
2. Use an image editor to resize it to 48x48 and 16x16
3. Place all three in the `icons/` folder
4. The extension will work, and you can replace icons later

## Resources

**Free Icon Tools:**
- Canva: https://www.canva.com
- Figma: https://www.figma.com
- GIMP: https://www.gimp.org/
- Photopea (online Photoshop): https://www.photopea.com/

**Icon Inspiration:**
- Chrome Web Store: https://chrome.google.com/webstore
- Zotero branding: https://www.zotero.org/
- Material Design Icons: https://fonts.google.com/icons

---

**Note:** The extension will still function without icons, but Chrome will show a default placeholder. For production/distribution, proper icons are essential for professionalism.
