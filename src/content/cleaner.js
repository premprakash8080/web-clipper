(() => {
  const WebVizz = (window.WebVizz = window.WebVizz || {});

  const BLOCK_SELECTORS = [
    "script",
    "iframe",
    "noscript",
    "[data-ad]",
    "[id*='ad-']",
    "[class*='ad-']",
    ".ad",
    "#ad"
  ];

  const sanitizeNode = (root) => {
    if (!root) {
      return;
    }

    BLOCK_SELECTORS.forEach((selector) => {
      root.querySelectorAll(selector).forEach((el) => el.remove());
    });
  };

  WebVizz.cleaner = {
    sanitizeNode
  };
})();

