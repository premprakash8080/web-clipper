(() => {
  const WebVizz = (window.WebVizz = window.WebVizz || {});

  const highlightCssPromise = fetch(
    chrome.runtime.getURL("src/styles/highlight.css")
  )
    .then((response) => response.text())
    .catch(() => "");

  class SelectionController {
    constructor() {
      this.selectionHandler = null;
      this.overlay = null;
      this.highlightBox = null;
      this.currentElement = null;
      this.highlightStyleEl = null;
      this.escapeHandler = this.handleEscape.bind(this);
      this.boundMouseMove = this.handleMouseMove.bind(this);
      this.boundMouseDown = this.handleMouseDown.bind(this);
    }

    async ensureStylesInjected(target) {
      if (!target) {
        return;
      }

      if (this.highlightStyleEl && document.contains(this.highlightStyleEl)) {
        return;
      }

      const cssText = await highlightCssPromise;
      if (!cssText) {
        return;
      }

      this.highlightStyleEl = document.createElement("style");
      this.highlightStyleEl.id = "webvizz-highlight-style";
      this.highlightStyleEl.textContent = cssText;
      target.appendChild(this.highlightStyleEl);
    }

    /**
     * Registers a callback invoked when the user confirms a selection.
     */
    setSelectionHandler(handler) {
      this.selectionHandler = handler;
    }

    /**
     * Creates the selection overlay that allows users to hover and click elements.
     * The overlay captures mouse events but allows clicks to pass through to underlying elements
     * by temporarily disabling pointer events when detecting the clicked element.
     */
    createOverlay() {
      if (this.overlay) {
        return;
      }

      this.overlay = document.createElement("div");
      this.overlay.className = "webvizz-selection-overlay";
      // Overlay needs to capture mouse events but clicks will pass through via getElementUnderPoint

      const instructions = document.createElement("div");
      instructions.className = "webvizz-selection-instructions";
      instructions.textContent = "Hover to highlight, click to clip • Press ESC to cancel";
      this.overlay.appendChild(instructions);

      this.highlightBox = document.createElement("div");
      this.highlightBox.className = "webvizz-highlight-box";
      this.overlay.appendChild(this.highlightBox);

      document.body.appendChild(this.overlay);
      document.addEventListener("keydown", this.escapeHandler);

      // Bind mouse events to the overlay
      // These events will be cleaned up in exitSelectionMode
      this.overlay.addEventListener("mousemove", this.boundMouseMove);
      this.overlay.addEventListener("mousedown", this.boundMouseDown);
    }

    /**
     * Handles mouse down events to capture the clicked element.
     * Uses the element directly under the click point, not the hovered element,
     * to ensure we capture exactly what the user clicked.
     */
    handleMouseDown(event) {
      event.preventDefault();
      event.stopPropagation();
      
      // Get the element directly under the click point
      const clickedElement = this.getElementUnderPoint(event.clientX, event.clientY);
      
      // Validate that we have a valid target element
      if (!this.isValidTarget(clickedElement)) {
        return;
      }

      // Ensure we have a selection handler registered
      if (!this.selectionHandler) {
        console.warn("Selection handler not set");
        return;
      }

      // Store the handler and clear it to prevent multiple triggers
      const handler = this.selectionHandler;
      this.selectionHandler = null;
      
      // Exit selection mode first to clean up overlay and listeners
      this.exitSelectionMode();
      
      // Invoke the handler with the clicked element
      handler(clickedElement);
    }

    handleMouseMove(event) {
      this.updateHighlightBox(event.clientX, event.clientY);
    }

    handleEscape(event) {
      if (event.key === "Escape") {
        this.exitSelectionMode();
      }
    }

    updateHighlightBox(clientX, clientY) {
      const target = this.getElementUnderPoint(clientX, clientY);

      if (!this.isValidTarget(target)) {
        this.highlightBox.style.display = "none";
        this.currentElement = null;
        return;
      }

      const rect = target.getBoundingClientRect();
      this.highlightBox.style.display = "block";
      Object.assign(this.highlightBox.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
      });

      this.currentElement = target;
    }

    getElementUnderPoint(x, y) {
      if (!this.overlay) {
        return document.elementFromPoint(x, y);
      }

      const previousPointerEvents = this.overlay.style.pointerEvents;
      this.overlay.style.pointerEvents = "none";
      const element = document.elementFromPoint(x, y);
      this.overlay.style.pointerEvents = previousPointerEvents || "all";

      if (element && this.overlay.contains(element)) {
        return null;
      }

      return element;
    }

    isValidTarget(target) {
      return (
        target &&
        target.nodeType === Node.ELEMENT_NODE &&
        target !== document.body &&
        target !== document.documentElement &&
        (!this.overlay || !this.overlay.contains(target))
      );
    }

    exitSelectionMode() {
      if (this.overlay) {
        this.overlay.removeEventListener("mousemove", this.boundMouseMove);
        this.overlay.removeEventListener("mousedown", this.boundMouseDown);
        this.overlay.remove();
        this.overlay = null;
        this.highlightBox = null;
      }
      document.removeEventListener("keydown", this.escapeHandler);
      this.currentElement = null;

      if (this.highlightStyleEl && this.highlightStyleEl.isConnected) {
        this.highlightStyleEl.remove();
      }
      this.highlightStyleEl = null;
    }

    /**
     * Enters selection mode by injecting styles and creating the overlay.
     * The selection handler should be set before calling this method via setSelectionHandler().
     */
    async enterSelectionMode() {
      // Reset state
      this.currentElement = null;
      
      // Warn if handler is not set (but continue - handler might be set later)
      if (!this.selectionHandler) {
        console.warn("Selection handler not set - selection clicks may not work");
      }
      
      // Inject highlight styles
      await this.ensureStylesInjected(document.head || document.body);
      
      // Create the overlay
      this.createOverlay();
    }
  }

  WebVizz.selector = {
    SelectionController
  };
})();

