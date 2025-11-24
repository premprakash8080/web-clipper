## WebVizz Clipper

WebVizz Clipper captures the visible portion of any web page — either the full view or a user-drawn selection — and downloads a standalone HTML snapshot with all inline/external CSS preserved.

### Project Structure

```
webvizz-clipper/
├─ assets/                 # Extension icons
├─ src/
│  ├─ popup/               # Popup UI
│  ├─ background/          # Service worker
│  ├─ content/             # Content scripts
│  ├─ utils/               # Shared helpers
│  └─ styles/              # Overlay-specific CSS
└─ manifest.json
```

### Development Notes

- `src/utils/cssExtractor.js` fetches every `<link rel="stylesheet">` and embeds the CSS inline to keep styling intact offline.
- `src/utils/domUtils.js` owns cloning helpers plus assembly of the final downloadable HTML document.
- `src/content/selector.js` provides the drag-to-select overlay, with its look defined in `src/styles/highlight.css`.
- `src/content/contentScript.js` orchestrates capture requests, selection mode, and message handling between popup/background scripts.

### Loading the Extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose the repository root.
4. Pin “WebVizz Clipper” to the toolbar for quick access.
Readme
