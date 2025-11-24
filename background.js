/**
 * Background service worker for WebVizz Clipper.
 * Handles communication between popup and content scripts,
 * then saves the generated clip through chrome.downloads.
 */

const MESSAGE_TYPES = {
  INITIATE_CLIP: "INITIATE_CLIP",
  CAPTURE_PAGE: "CAPTURE_PAGE",
  ENTER_SELECTION_MODE: "ENTER_SELECTION_MODE",
  SELECTION_COMPLETE: "SELECTION_COMPLETE",
  CLIP_READY: "CLIP_READY",
  CLIP_ERROR: "CLIP_ERROR"
};

/**
 * Handles download of the generated HTML string.
 * @param {string} htmlContent - Serialized HTML returned by the content script.
 * 
 * Note: In Manifest V3 service workers, URL.createObjectURL is not available.
 * We use a data URL instead to download the HTML content.
 */
const downloadClip = async (htmlContent) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `clip_${timestamp}.html`;
  
  // Convert HTML content to a data URL (service workers don't support URL.createObjectURL)
  // Using encodeURIComponent to properly encode the HTML content
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;

  await chrome.downloads.download({
    url: dataUrl,
    filename: fileName,
    saveAs: true
  });
};

/**
 * Queries the active tab in the current window.
 */
const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
};

/**
 * Handles selection complete message and proceeds with clipping
 */
const handleSelectionComplete = async (tabId, selectionBounds) => {
  try {
    const clipPayload = await chrome.tabs.sendMessage(tabId, {
      type: MESSAGE_TYPES.CAPTURE_PAGE,
      mode: "selection",
      selectionBounds
    });

    if (!clipPayload?.html) {
      throw new Error(clipPayload?.error || "Failed to capture the page.");
    }

    await downloadClip(clipPayload.html);
    
    // Notify popup of success
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.CLIP_READY,
      success: true
    });
  } catch (error) {
    console.error("Clip failed:", error);
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.CLIP_ERROR,
      success: false,
      error: error.message
    });
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle selection complete from content script
  if (message?.type === MESSAGE_TYPES.SELECTION_COMPLETE) {
    (async () => {
      const tabId = sender.tab?.id;
      if (!tabId) {
        console.error("No tab ID for selection complete");
        return;
      }
      await handleSelectionComplete(tabId, message.selectionBounds);
    })();
    return true;
  }

  // Handle initiate clip from popup
  if (message?.type === MESSAGE_TYPES.INITIATE_CLIP) {
    (async () => {
      try {
        const activeTab = await getActiveTab();
        if (!activeTab?.id) {
          throw new Error("Unable to find the current tab.");
        }

        // If selection mode, enter selection mode and wait for user to select
        if (message.mode === "selection") {
          await chrome.tabs.sendMessage(activeTab.id, {
            type: MESSAGE_TYPES.ENTER_SELECTION_MODE
          });
          sendResponse({ success: true, message: "Select an area on the page" });
          return;
        }

        // For full page, proceed immediately
        const clipPayload = await chrome.tabs.sendMessage(activeTab.id, {
          type: MESSAGE_TYPES.CAPTURE_PAGE,
          mode: message.mode
        });

        if (!clipPayload?.html) {
          throw new Error(clipPayload?.error || "Failed to capture the page.");
        }

        await downloadClip(clipPayload.html);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Clip failed:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    // Keep the message channel open for the async work.
    return true;
  }

  return false;
});