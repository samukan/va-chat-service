import { createHmac } from 'node:crypto';
import type { AppConfig } from '../core/config.js';

export interface RetrievalSearchInput {
  query: string;
  tenantId: string;
  topK?: number;
  correlationId: string;
  signal?: AbortSignal;
}

export interface RetrievedChunk {
  doc_id: string;
  text: string;
  source?: string;
  score?: number;
}

export interface RetrievalClient {
  search(input: RetrievalSearchInput): Promise<RetrievedChunk[]>;
}

type MilvusSearchResponse = {
  results?: Array<{
    doc_id?: unknown;
    text?: unknown;
    source?: unknown;
    score?: unknown;
  }>;
};

function signMilvusRequest(params: {
  method: string;
  url: URL;
  body: string;
  secret: string;
}) {
  const timestamp = Date.now().toString();
  const payload = [
    params.method.toUpperCase(),
    `${params.url.pathname}${params.url.search}`,
    timestamp,
    params.body,
  ].join('\n');

  const signature = createHmac('sha256', params.secret)
    .update(payload)
    .digest('hex');

  return {
    timestamp,
    signature,
  };
}

export class MilvusRetrievalClient implements RetrievalClient {
  constructor(private readonly config: AppConfig) {}

  async search(input: RetrievalSearchInput): Promise<RetrievedChunk[]> {
    const url = new URL('/api/v1/vector/search', this.config.milvus.apiUrl);
    const body = JSON.stringify({
      query: input.query,
      tenant_id: input.tenantId,
      topK: input.topK ?? this.config.milvus.topK,
    });

    const signed = signMilvusRequest({
      method: 'POST',
      url,
      body,
      secret: this.config.milvus.sourceSecret,
    });

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.config.milvus.timeoutMs);
    const relayAbort = () => abortController.abort();
    input.signal?.addEventListener('abort', relayAbort);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-timestamp': signed.timestamp,
          'x-signature': signed.signature,
          'x-correlation-id': input.correlationId,
        },
        body,
        signal: abortController.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Milvus search failed: status=${response.status} body=${text.slice(0, 300)}`,
        );
      }

      const payload = (await response.json()) as MilvusSearchResponse;
      const results = Array.isArray(payload.results) ? payload.results : [];

      return results
        .map((item) => ({
          doc_id: typeof item.doc_id === 'string' ? item.doc_id : '',
          text: typeof item.text === 'string' ? item.text : '',
          source: typeof item.source === 'string' ? item.source : undefined,
          score:
            typeof item.score === 'number' && Number.isFinite(item.score)
              ? item.score
              : undefined,
        }))
        .filter((item) => item.doc_id.length > 0 && item.text.length > 0);
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', relayAbort);
    }
  }
}