function collectStringValues(value, sink) {
  if (value == null) {
    return;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    const looksLikeUrl = /^https?:\/\//i.test(trimmed);
    const looksLikeFile = /\.(pdf|docx?|txt|md|html?)$/i.test(trimmed);

    if (looksLikeUrl || looksLikeFile) {
      sink.add(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, sink);
    }
    return;
  }

  if (typeof value === 'object') {
    for (const entryValue of Object.values(value)) {
      collectStringValues(entryValue, sink);
    }
  }
}

export function extractSourcesFromEvent(event) {
  const sources = new Set();
  collectStringValues(event, sources);
  return Array.from(sources);
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

  const lines = sources.map((source) => `- ${source}`);
  return `\n\nLähteet:\n${lines.join('\n')}`;
}
