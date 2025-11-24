(() => {
  const ACTIONS = {
    START_SELECTION_MODE: "start-selection-mode",
    EXIT_SELECTION_MODE: "exit-selection-mode",
    CAPTURE_FULL_PAGE: "capture-full-page",
    DOWNLOAD_SELECTION: "download-selection",
    CLIP_ERROR: "clip-error"
  };

  const WebVizz = window.WebVizz || {};
  const { inlineExternalStyles } = WebVizz.cssExtractor;
  const {
    serializeBodyAttributes,
    cloneFullBody,
    getCleanOuterHTML,
    buildDocumentHtml
  } = WebVizz.domUtils;
  const { collectMediaSources } = WebVizz.mediaExtractor;
  const { SelectionController } = WebVizz.selector;

  const selectionController = new SelectionController();

  /**
   * Builds the downloadable HTML document for either full-page or selection clips.
   * Embeds a metadata comment that includes the detected video sources so that
   * downstream tools can embed media without forcing the extension to download
   * large binary files.
   */
  const buildClipHtml = async ({ mode, selectionHtml, mediaSources = [] }) => {
    const styleTag = await inlineExternalStyles();
    const timestamp = new Date().toLocaleString();
    const metadataPayload = {
      sourceUrl: location.href,
      clippedAt: timestamp,
      mode,
      videos: mediaSources
    };
    const metadataComment = `<!-- WebVizzMetadata\n${JSON.stringify(
      metadataPayload,
      null,
      2
    )}\n-->`;
    const content =
      mode === "selection" ? selectionHtml : cloneFullBody().innerHTML;
    const bodyAttributes = mode === "selection" ? "" : serializeBodyAttributes();

    return buildDocumentHtml({
      title: document.title,
      styles: styleTag,
      metadata: metadataComment,
      bodyAttributes,
      content
    });
  };

  /**
   * Handles the element returned by the selection controller.
   * This is called after the user clicks on a highlighted element.
   * Extracts the element's HTML, collects media sources, and sends
   * the complete clip to the background for download.
   */
  const handleElementSelected = async (element) => {
    try {
      // Validate element exists and is still in the DOM
      if (!element || !element.isConnected) {
        throw new Error("Selected element is no longer available.");
      }

      // Collect media sources from the selected element
      const mediaSources = collectMediaSources(element);
      
      // Get clean HTML of the selected element (removes scripts, ads, etc.)
      const elementHtml = getCleanOuterHTML(element);

      if (!elementHtml?.trim()) {
        throw new Error("Unable to capture the selected element - element is empty.");
      }

      // Build the complete HTML document with metadata
      const clipHtml = await buildClipHtml({
        mode: "selection",
        selectionHtml: elementHtml,
        mediaSources
      });

      // Send to background for download
      chrome.runtime.sendMessage({
        action: ACTIONS.DOWNLOAD_SELECTION,
        html: clipHtml
      });
    } catch (error) {
      console.error("Selection capture failed", error);
      // Notify background of the error
      chrome.runtime.sendMessage({
        action: ACTIONS.CLIP_ERROR,
        error: error.message
      });
    }
  };

  // Register the selection handler before any messages are received
  // This ensures the handler is ready when selection mode is entered
  selectionController.setSelectionHandler(handleElementSelected);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === ACTIONS.START_SELECTION_MODE) {
      // Ensure handler is set (safety check in case content script was re-injected)
      selectionController.setSelectionHandler(handleElementSelected);
      
      // Enter selection mode (will validate handler is set internally)
      selectionController.enterSelectionMode();
      sendResponse({ success: true });
      return true;
    }

    if (message?.action === ACTIONS.EXIT_SELECTION_MODE) {
      selectionController.exitSelectionMode();
      sendResponse({ success: true });
      return true;
    }

    if (message?.action === ACTIONS.CAPTURE_FULL_PAGE) {
      (async () => {
        try {
          const mediaSources = collectMediaSources(document.body);
          const html = await buildClipHtml({
            mode: "full",
            mediaSources
          });
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
})();