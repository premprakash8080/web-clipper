(() => {
  const WebVizz = (window.WebVizz = window.WebVizz || {});

  const VIDEO_HOSTS = [
    { type: "youtube", pattern: /youtube\.com|youtu\.be/i },
    { type: "vimeo", pattern: /vimeo\.com/i }
  ];

  /**
   * Finds a friendly type based on known video hostnames.
   */
  const inferEmbedType = (url) => {
    if (!url) {
      return "iframe";
    }

    const hostEntry = VIDEO_HOSTS.find(({ pattern }) => pattern.test(url));
    return hostEntry ? hostEntry.type : "iframe";
  };

  /**
   * Collects unique video/iframe media URLs from the provided root element.
   * Only references are stored – we intentionally avoid downloading media
   * because those files are typically large and would block the clipping UX.
   */
  const collectMediaSources = (root) => {
    if (!root) {
      return [];
    }

    const media = [];
    const seen = new Set();

    // Handle <video> tags and any nested <source> tags.
    root.querySelectorAll("video").forEach((video) => {
      if (video.src && !seen.has(video.src)) {
        seen.add(video.src);
        media.push({ type: "video", url: video.src });
      }

      video.querySelectorAll("source").forEach((source) => {
        if (source.src && !seen.has(source.src)) {
          seen.add(source.src);
          media.push({ type: "video", url: source.src });
        }
      });
    });

    // Capture embeddable players inside <iframe>s (YouTube, Vimeo, etc.).
    root.querySelectorAll("iframe").forEach((frame) => {
      const src = frame.src;
      if (!src || seen.has(src)) {
        return;
      }

      seen.add(src);
      media.push({ type: inferEmbedType(src), url: src });
    });

    return media;
  };

  WebVizz.mediaExtractor = {
    collectMediaSources
  };
})();

