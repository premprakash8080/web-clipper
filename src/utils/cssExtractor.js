(() => {
  const WebVizz = (window.WebVizz = window.WebVizz || {});

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

    const inlineStyleTags = Array.from(document.querySelectorAll("style")).map(
      (styleEl) => styleEl.textContent || ""
    );

    const combinedStyles = [...inlineStyleTags, ...styleBlocks]
      .filter(Boolean)
      .join("\n\n");

    if (!combinedStyles.trim()) {
      return "";
    }

    return `<style>\n${combinedStyles}\n</style>`;
  };

  WebVizz.cssExtractor = {
    inlineExternalStyles
  };
})();

