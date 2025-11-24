const MESSAGE_TYPES = {
  INITIATE_CLIP: "INITIATE_CLIP",
  CLIP_READY: "CLIP_READY",
  CLIP_ERROR: "CLIP_ERROR"
};

const STATUS_VARIANTS = {
  idle: "status",
  success: "status success",
  error: "status error"
};

/**
 * Updates status text within the popup so users get feedback.
 */
const setStatus = (text, variant = "idle") => {
  const statusEl = document.getElementById("status");
  if (!statusEl) {
    return;
  }

  statusEl.textContent = text;
  statusEl.className = STATUS_VARIANTS[variant] || STATUS_VARIANTS.idle;
};

/**
 * Listens for clip completion messages from background
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MESSAGE_TYPES.CLIP_READY) {
    setStatus("Clip ready! Check your downloads.", "success");
  } else if (message?.type === MESSAGE_TYPES.CLIP_ERROR) {
    setStatus(`Something went wrong: ${message.error}`, "error");
  }
});

/**
 * Sends the clip request to the background worker.
 */
const requestClip = async (mode) => {
  if (mode === "selection") {
    setStatus("Select an area on the page...", "idle");
  } else {
    setStatus("Clipping in progress…");
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.INITIATE_CLIP,
      mode
    });

    if (!response?.success) {
      throw new Error(response?.error || "Clip failed.");
    }

    // For selection mode, we'll get a message later when selection is complete
    if (mode === "selection" && response.message) {
      setStatus(response.message, "idle");
    } else if (mode !== "selection") {
      setStatus("Clip ready! Check your downloads.", "success");
    }
  } catch (error) {
    setStatus(`Something went wrong: ${error.message}`, "error");
  }
};

const wireButton = (id, mode) => {
  const button = document.getElementById(id);
  if (!button) {
    return;
  }

  button.addEventListener("click", () => requestClip(mode));
};

document.addEventListener("DOMContentLoaded", () => {
  wireButton("clipFull", "full");
  wireButton("clipSelection", "selection");
});