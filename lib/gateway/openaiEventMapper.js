function isUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function isLikelyFileName(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || isUrl(trimmed)) {
    return false;
  }

  return /\.(pdf|docx?|txt|md|html?)$/i.test(trimmed);
}

function inferLabelFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/' || parsed.pathname === '') {
      return 'Homepage';
    }

    const cleaned = parsed.pathname.replace(/^\/+|\/+$/g, '');
    if (!cleaned) {
      return 'Homepage';
    }

    return decodeURIComponent(cleaned)
      .split('/')
      .pop()
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return 'Website';
  }
}

function addWebsiteCitation(sink, url, title) {
  let detectedFromAttributes = false;

  if (arguments.length >= 4) {
    detectedFromAttributes = Boolean(arguments[3]);
  }

  if (!isUrl(url)) {
    return;
  }

  sink.push({
    kind: 'website',
    url: url.trim(),
    label: (typeof title === 'string' && title.trim()) || inferLabelFromUrl(url),
    detectedFromAttributes,
  });
}

function addFileCitation(sink, fileLabel) {
  if (!isLikelyFileName(fileLabel)) {
    return;
  }

  sink.push({
    kind: 'file',
    id: fileLabel.trim().toLowerCase(),
    label: fileLabel.trim(),
  });
}

function collectSourceCandidates(value, sink) {
  if (value == null) {
    return;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    if (isUrl(trimmed)) {
      addWebsiteCitation(sink, trimmed, inferLabelFromUrl(trimmed));
      return;
    }

    if (isLikelyFileName(trimmed)) {
      addFileCitation(sink, trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSourceCandidates(item, sink);
    }
    return;
  }

  if (typeof value === 'object') {
    const attributes = value.attributes && typeof value.attributes === 'object' ? value.attributes : null;
    const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : null;

    const attributesSourceType = String(attributes?.source_type || '').toLowerCase();
    const metadataSourceType = String(metadata?.source_type || '').toLowerCase();

    const websiteSourceType =
      attributesSourceType || metadataSourceType || String(value.source_type || '').toLowerCase();

    const websiteUrl =
      (typeof attributes?.url === 'string' && attributes.url) ||
      (typeof metadata?.url === 'string' && metadata.url) ||
      (typeof value.url === 'string' && value.url) ||
      '';

    const websiteTitle =
      (typeof attributes?.title === 'string' && attributes.title) ||
      (typeof metadata?.title === 'string' && metadata.title) ||
      (typeof value.title === 'string' && value.title) ||
      (typeof value.filename === 'string' && value.filename) ||
      '';

    const isWebsiteObject = websiteSourceType === 'website' && isUrl(websiteUrl);

    if (isWebsiteObject) {
      addWebsiteCitation(
        sink,
        websiteUrl,
        websiteTitle,
        Boolean(typeof attributes?.url === 'string' && attributes.url)
      );
    }

    if (!isWebsiteObject) {
      if (typeof attributes?.filename === 'string') {
        addFileCitation(sink, attributes.filename);
      }
      if (typeof metadata?.filename === 'string') {
        addFileCitation(sink, metadata.filename);
      }
      if (typeof value.filename === 'string') {
        addFileCitation(sink, value.filename);
      }
    }

    for (const [key, entryValue] of Object.entries(value)) {
      if (isWebsiteObject && (key === 'filename' || key === 'attributes' || key === 'metadata')) {
        continue;
      }
      collectSourceCandidates(entryValue, sink);
    }
  }
}

export function extractSourcesFromEvent(event) {
  const sources = [];
  collectSourceCandidates(event, sources);
  return sources;
}

export function mapOpenAIEventToFrontendSse(event) {
  const type = event?.type;

  if (type === 'response.output_text.delta') {
    return {
      sse: {
        event: 'response.output_text.delta',
        data: {
          delta: typeof event.delta === 'string' ? event.delta : '',
        },
      },
      deltaText: typeof event.delta === 'string' ? event.delta : '',
      done: false,
      sources: extractSourcesFromEvent(event),
    };
  }

  if (type === 'response.output_text.done') {
    return {
      sse: null,
      deltaText: '',
      done: true,
      sources: extractSourcesFromEvent(event),
    };
  }

  if (type === 'error') {
    return {
      sse: {
        event: 'error',
        data: {
          error: {
            message: event?.error?.message || 'Virhe vastauksen käsittelyssä',
          },
        },
      },
      deltaText: '',
      done: false,
      sources: extractSourcesFromEvent(event),
    };
  }

  return {
    sse: null,
    deltaText: '',
    done: false,
    sources: extractSourcesFromEvent(event),
  };
}

export function buildSourcesSuffix(sources) {
  if (!sources || sources.length === 0) {
    return '';
  }

  const websiteCitations = [];
  const fileCitations = [];
  const seenWebsiteUrls = new Set();
  const seenFileIds = new Set();

  for (const source of sources) {
    if (typeof source === 'string') {
      if (isUrl(source)) {
        if (!seenWebsiteUrls.has(source)) {
          seenWebsiteUrls.add(source);
          websiteCitations.push({
            label: inferLabelFromUrl(source),
            url: source,
            detectedFromAttributes: false,
          });
        }
      } else if (isLikelyFileName(source)) {
        const id = source.trim().toLowerCase();
        if (!seenFileIds.has(id)) {
          seenFileIds.add(id);
          fileCitations.push({ label: source.trim() });
        }
      }
      continue;
    }

    if (!source || typeof source !== 'object') {
      continue;
    }

    if (source.kind === 'website' && isUrl(source.url)) {
      const normalizedUrl = source.url.trim();
      if (!seenWebsiteUrls.has(normalizedUrl)) {
        seenWebsiteUrls.add(normalizedUrl);
        websiteCitations.push({
          label:
            (typeof source.label === 'string' && source.label.trim()) ||
            inferLabelFromUrl(normalizedUrl),
          url: normalizedUrl,
          detectedFromAttributes: Boolean(source.detectedFromAttributes),
        });
      }
      continue;
    }

    if (source.kind === 'file' && typeof source.label === 'string') {
      const id = (source.id || source.label).trim().toLowerCase();
      if (!seenFileIds.has(id)) {
        seenFileIds.add(id);
        fileCitations.push({ label: source.label.trim() });
      }
    }
  }

  const lines = [
    ...websiteCitations.map((item) => `- ${item.label}: ${item.url}`),
    ...fileCitations.map((item) => `- ${item.label}`),
  ];

  if (lines.length === 0) {
    return '';
  }

  if (process.env.DEBUG_SOURCE_CITATIONS === '1') {
    const websiteFromAttributes = websiteCitations.filter(
      (item) => item.detectedFromAttributes
    ).length;

    console.log(
      `[source-citations] website=${websiteCitations.length} website_from_attributes=${websiteFromAttributes} pdf_or_file=${fileCitations.length} labels=${JSON.stringify(
        lines.map((line) => line.slice(2))
      )}`
    );
  }

  return `\n\nLähteet:\n${lines.join('\n')}`;
}
