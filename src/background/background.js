/**
 * Background service worker for WebVizz Clipper.
 * Handles communication between popup and content scripts,
 * then saves the generated clip through chrome.downloads.
 */

const ACTIONS = {
  START_SELECTION_MODE: "start-selection-mode",
  CLIP_FULL_PAGE: "clip-full-page",
  DOWNLOAD_SELECTION: "download-selection",
  CAPTURE_FULL_PAGE: "capture-full-page",
  CLIP_READY: "clip-ready",
  CLIP_ERROR: "clip-error"
};

const CONTENT_SCRIPT_FILES = [
  "src/content/cleaner.js",
  "src/utils/domUtils.js",
  "src/utils/cssExtractor.js",
  "src/utils/mediaExtractor.js",
  "src/content/selector.js",
  "src/content/contentScript.js"
];

/**
 * Handles download of the generated HTML string.
 * @param {string} htmlContent - Serialized HTML returned by the content script.
 * 
 * Note: In Manifest V3 service workers, URL.createObjectURL is not available.
 * We use a data URL instead to download the HTML content.
 */
const downloadClip = async (htmlContent, mode = "full") => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = mode === "selection" ? "_selection" : "";
  const fileName = `clip_${timestamp}${suffix}.html`;
  
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
 * Attempts to send a message to the content script. If the script has not been
 * injected yet (which can happen on lazy-loaded pages), it injects the script
 * bundle and retries the message once.
 */
const sendMessageWithInjection = async (tabId, payload) => {
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (error) {
    const message = error?.message || "";
    const needsInjection =
      message.includes("Could not establish connection") ||
      message.includes("Receiving end does not exist");

    if (!needsInjection) {
      throw error;
    }

    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: CONTENT_SCRIPT_FILES
    });

    return chrome.tabs.sendMessage(tabId, payload);
  }
};

/**
 * Handles selection complete message and proceeds with clipping
 */
const handleSelectionComplete = async (htmlContent) => {
  try {
    if (!htmlContent) {
      throw new Error("No selection content returned.");
    }

    await downloadClip(htmlContent, "selection");
    
    // Notify popup of success
    chrome.runtime.sendMessage({
      action: ACTIONS.CLIP_READY,
      success: true
    });
  } catch (error) {
    console.error("Clip failed:", error);
    chrome.runtime.sendMessage({
      action: ACTIONS.CLIP_ERROR,
      success: false,
      error: error.message
    });
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === ACTIONS.DOWNLOAD_SELECTION) {
    (async () => {
      await handleSelectionComplete(message.html);
    })();
    return true;
  }

  if (message?.action === ACTIONS.CLIP_ERROR) {
    chrome.runtime.sendMessage({
      action: ACTIONS.CLIP_ERROR,
      success: false,
      error: message.error || "Selection capture failed."
    });
    return true;
  }

  if (message?.action === ACTIONS.START_SELECTION_MODE || message?.action === ACTIONS.CLIP_FULL_PAGE) {
    (async () => {
      try {
        const activeTab = await getActiveTab();
        if (!activeTab?.id) {
          throw new Error("Unable to find the current tab.");
        }

        if (message.action === ACTIONS.START_SELECTION_MODE) {
          await sendMessageWithInjection(activeTab.id, {
            action: ACTIONS.START_SELECTION_MODE
          });
          sendResponse({ success: true, message: "Hover and click an element to clip" });
          return;
        }

        // Full page capture flow
        const clipPayload = await sendMessageWithInjection(activeTab.id, {
          action: ACTIONS.CAPTURE_FULL_PAGE
        });

        if (!clipPayload?.html) {
          throw new Error(clipPayload?.error || "Failed to capture the page.");
        }

        await downloadClip(clipPayload.html, "full");
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