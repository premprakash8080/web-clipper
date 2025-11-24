(() => {
  const WebVizz = (window.WebVizz = window.WebVizz || {});

  const serializeBodyAttributes = () => (
    document.body
      .getAttributeNames()
      .map((name) => ` ${name}="${document.body.getAttribute(name)}"`)
      .join("")
  );

  const cloneFullBody = () => {
    const clone = document.body.cloneNode(true);
    WebVizz.cleaner?.sanitizeNode(clone);
    return clone;
  };

  /**
   * Creates a sanitized HTML string for the selected element only.
   */
  const getCleanOuterHTML = (element) => {
    if (!element) {
      return "";
    }

    const clone = element.cloneNode(true);
    WebVizz.cleaner?.sanitizeNode(clone);
    return clone.outerHTML;
  };

  const buildDocumentHtml = ({ title, styles, metadata, bodyAttributes = "", content }) => {
    return [
      "<!DOCTYPE html>",
      "<html>",
      "<head>",
      '<meta charset="utf-8" />',
      `<title>${title || "WebVizz Clip"}</title>`,
      styles,
      "</head>",
      `<body${bodyAttributes || ""}>`,
      metadata,
      content,
      "</body>",
      "</html>"
    ]
      .filter(Boolean)
      .join("\n");
  };

  WebVizz.domUtils = {
    serializeBodyAttributes,
    cloneFullBody,
    getCleanOuterHTML,
    buildDocumentHtml
  };
})();

