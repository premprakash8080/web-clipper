const MESSAGE_TYPES = {
  CAPTURE_PAGE: "CAPTURE_PAGE",
  ENTER_SELECTION_MODE: "ENTER_SELECTION_MODE",
  EXIT_SELECTION_MODE: "EXIT_SELECTION_MODE",
  SELECTION_COMPLETE: "SELECTION_COMPLETE"
};

/**
 * Removes unwanted elements from the provided root node.
 * @param {HTMLElement} root
 */
const sanitizeNode = (root) => {
  if (!root) {
    return;
  }

  const selectorsToRemove = [
    "script",
    "iframe",
    "noscript",
    "[data-ad]",
    "[id*='ad-']",
    "[class*='ad-']",
    ".ad",
    "#ad"
  ];

  selectorsToRemove.forEach((selector) => {
    root.querySelectorAll(selector).forEach((el) => el.remove());
  });
};

/**
 * Converts external stylesheet links into inline style tags.
 */
const inlineExternalStyles = async () => {
  const stylesheetLinks = Array.from(
    document.querySelectorAll('link[rel="stylesheet"]')
  );

  const styleBlocks = await Promise.all(
    stylesheetLinks.map(async (linkEl) => {
      const href = linkEl.href;
      if (!href) {
        return "";
      }

      try {
        const response = await fetch(href);
        if (!response.ok) {
          throw new Error(`Failed to load stylesheet: ${href}`);
        }

        const cssText = await response.text();
        return `/* Inlined from: ${href} */\n${cssText}`;
      } catch (error) {
        console.warn("Unable to inline stylesheet", href, error);
        return "";
      }
    })
  );

  const inlineStyleTags = Array.from(
    document.querySelectorAll("style")
  ).map((styleEl) => styleEl.textContent || "");

  const combinedStyles = [...inlineStyleTags, ...styleBlocks]
    .filter(Boolean)
    .join("\n\n");

  if (!combinedStyles.trim()) {
    return "";
  }

  return `<style>\n${combinedStyles}\n</style>`;
};

/**
 * Creates a clone of elements within a bounding rectangle.
 * Uses Range API to extract content within the selection bounds.
 * @param {Object} bounds - The bounding rectangle {left, top, right, bottom, width, height}
 * @returns {string} - HTML content of elements within bounds
 */
const cloneAreaSelection = (bounds) => {
  // Create a range that covers the selection area
  const range = document.createRange();
  
  // Find elements at the corners and center to establish the range
  const topLeftEl = document.elementFromPoint(bounds.left, bounds.top);
  const bottomRightEl = document.elementFromPoint(bounds.right, bounds.bottom);
  const centerEl = document.elementFromPoint(
    bounds.left + bounds.width / 2,
    bounds.top + bounds.height / 2
  );

  if (!centerEl) {
    return null;
  }

  // Try to find a common ancestor that contains the selection area
  let container = centerEl;
  let bestContainer = container;
  
  // Walk up to find a container that encompasses the selection
  while (container && container !== document.body && container !== document.documentElement) {
    const rect = container.getBoundingClientRect();
    // Check if container overlaps significantly with selection
    const overlapLeft = Math.max(0, Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left));
    const overlapTop = Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top));
    const overlapArea = overlapLeft * overlapTop;
    const selectionArea = bounds.width * bounds.height;
    
    // If overlap is significant, this is a good container
    if (overlapArea / selectionArea > 0.5) {
      bestContainer = container;
    }
    
    // Stop if we found a container that fully contains the selection
    if (rect.left <= bounds.left && rect.top <= bounds.top && 
        rect.right >= bounds.right && rect.bottom >= bounds.bottom) {
      bestContainer = container;
      break;
    }
    
    container = container.parentElement;
  }

  // Clone the best container we found
  const clone = bestContainer.cloneNode(true);
  sanitizeNode(clone);

  // Create a wrapper div to contain the selection
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    width: ${bounds.width}px;
    min-height: ${bounds.height}px;
    overflow: hidden;
    position: relative;
  `;
  
  wrapper.appendChild(clone);

  return wrapper.innerHTML;
};

/**
 * Creates a clone of the current text selection. Falls back to the full body.
 * @returns {{html: string, isSelection: boolean}}
 */
const cloneTextSelection = () => {
  const selection = window.getSelection();

  if (!selection || selection.isCollapsed) {
    const fallbackBody = document.body.cloneNode(true);
    sanitizeNode(fallbackBody);
    return {
      html: fallbackBody.innerHTML,
      isSelection: false
    };
  }

  const wrapper = document.createElement("div");
  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i);
    wrapper.appendChild(range.cloneContents());
  }

  sanitizeNode(wrapper);
  return {
    html: wrapper.innerHTML,
    isSelection: true
  };
};

/**
 * Serializes body attributes so they can be re-applied in the clip.
 */
const serializeBodyAttributes = () => {
  return document.body
    .getAttributeNames()
    .map((name) => ` ${name}="${document.body.getAttribute(name)}"`)
    .join("");
};

/**
 * Builds the final HTML document string that will be downloaded.
 */
const buildClipHtml = async (mode, selectionBounds = null) => {
  const styleTag = await inlineExternalStyles();
  const metadata = `<!-- Clipped from: ${location.href} at ${new Date().toLocaleString()} -->`;
  const bodyAttributes = serializeBodyAttributes();

  let bodyHtml;
  if (mode === "selection") {
    if (selectionBounds) {
      // Use area selection (visual drag selection)
      const areaHtml = cloneAreaSelection(selectionBounds);
      bodyHtml = areaHtml || document.body.innerHTML;
    } else {
      // Fallback to text selection
      const selectionClone = cloneTextSelection();
      bodyHtml = selectionClone.html;
    }
  } else {
    const bodyClone = document.body.cloneNode(true);
    sanitizeNode(bodyClone);
    bodyHtml = bodyClone.innerHTML;
  }

  return [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8" />',
    `<title>${document.title || "WebVizz Clip"}</title>`,
    styleTag,
    "</head>",
    `<body${bodyAttributes}>`,
    metadata,
    bodyHtml,
    "</body>",
    "</html>"
  ]
    .filter(Boolean)
    .join("\n");
};

/**
 * Visual selection tool state
 */
let isSelectionMode = false;
let selectionOverlay = null;
let selectionStartX = 0;
let selectionStartY = 0;
let selectionBox = null;

/**
 * Creates and injects the selection overlay into the page
 */
const createSelectionOverlay = () => {
  if (selectionOverlay) {
    return;
  }

  selectionOverlay = document.createElement("div");
  selectionOverlay.id = "webvizz-selection-overlay";
  selectionOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 999999;
    cursor: crosshair;
    background: rgba(0, 0, 0, 0.1);
    pointer-events: all;
  `;

  // Instructions banner
  const instructions = document.createElement("div");
  instructions.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #0ea5e9;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000000;
    pointer-events: none;
  `;
  instructions.textContent = "Drag to select area • Press ESC to cancel";
  selectionOverlay.appendChild(instructions);

  // Selection box
  selectionBox = document.createElement("div");
  selectionBox.style.cssText = `
    position: absolute;
    border: 2px solid #0ea5e9;
    background: rgba(14, 165, 233, 0.1);
    pointer-events: none;
    display: none;
  `;
  selectionOverlay.appendChild(selectionBox);

  document.body.appendChild(selectionOverlay);

  // Mouse down - start selection
  selectionOverlay.addEventListener("mousedown", (e) => {
    e.preventDefault();
    selectionStartX = e.clientX;
    selectionStartY = e.clientY;
    selectionBox.style.display = "block";
    updateSelectionBox(e.clientX, e.clientY);
  });

  // Mouse move - update selection box
  selectionOverlay.addEventListener("mousemove", (e) => {
    if (selectionBox.style.display === "block") {
      updateSelectionBox(e.clientX, e.clientY);
    }
  });

  // Mouse up - complete selection
  selectionOverlay.addEventListener("mouseup", async (e) => {
    if (selectionBox.style.display === "block") {
      const bounds = getSelectionBounds(e.clientX, e.clientY);
      exitSelectionMode();
      
      // Send the selection bounds to background for clipping
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.SELECTION_COMPLETE,
        selectionBounds: bounds
      });
    }
  });

  // ESC key to cancel
  const handleEscape = (e) => {
    if (e.key === "Escape" && isSelectionMode) {
      exitSelectionMode();
    }
  };
  document.addEventListener("keydown", handleEscape);
};

/**
 * Updates the visual selection box during drag
 */
const updateSelectionBox = (endX, endY) => {
  const left = Math.min(selectionStartX, endX);
  const top = Math.min(selectionStartY, endY);
  const width = Math.abs(endX - selectionStartX);
  const height = Math.abs(endY - selectionStartY);

  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;
};

/**
 * Gets the final selection bounds as a DOMRect-like object
 */
const getSelectionBounds = (endX, endY) => {
  return {
    left: Math.min(selectionStartX, endX),
    top: Math.min(selectionStartY, endY),
    right: Math.max(selectionStartX, endX),
    bottom: Math.max(selectionStartY, endY),
    width: Math.abs(endX - selectionStartX),
    height: Math.abs(endY - selectionStartY)
  };
};

/**
 * Removes the selection overlay and exits selection mode
 */
const exitSelectionMode = () => {
  if (selectionOverlay) {
    selectionOverlay.remove();
    selectionOverlay = null;
    selectionBox = null;
  }
  isSelectionMode = false;
};

/**
 * Enters visual selection mode
 */
const enterSelectionMode = () => {
  if (isSelectionMode) {
    return;
  }
  isSelectionMode = true;
  createSelectionOverlay();
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Handle entering selection mode
  if (message?.type === MESSAGE_TYPES.ENTER_SELECTION_MODE) {
    enterSelectionMode();
    sendResponse({ success: true });
    return true;
  }

  // Handle exiting selection mode
  if (message?.type === MESSAGE_TYPES.EXIT_SELECTION_MODE) {
    exitSelectionMode();
    sendResponse({ success: true });
    return true;
  }

  // Handle capture page request
  if (message?.type === MESSAGE_TYPES.CAPTURE_PAGE) {
    (async () => {
      try {
        const html = await buildClipHtml(
          message.mode || "full",
          message.selectionBounds || null
        );
        sendResponse({ html });
      } catch (error) {
        console.error("Failed to build clip", error);
        sendResponse({ error: error.message });
      }
    })();

    return true;
  }

  return false;
});