import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChatGateway, ChatRunInput } from '../src/llm/openaiChatGateway.js';
import type {
  RetrievalClient,
  RetrievalSearchInput,
  RetrievedChunk,
} from '../src/retrieval/milvusRetrievalClient.js';
import { buildApp } from '../src/app.js';
import { buildSignedHeaders } from './helpers/hmac.js';

class FakeChatGateway implements ChatGateway {
  async *streamText(_input: ChatRunInput): AsyncIterable<string> {
    yield 'Hei';
    yield ' maailma';
  }

  async checkDependency() {
    return { ok: true };
  }
}

class FakeRetrievalClient implements RetrievalClient {
  async search(_input: RetrievalSearchInput): Promise<RetrievedChunk[]> {
    return [
      {
        doc_id: 'tenant::t-1::file::f1::chunk::0',
        text: 'Vaihto-opiskelun haku alkaa kohdekorkeakoulujen kartoituksella.',
        source: 'Exchange handbook.pdf',
        score: 0.88,
      },
    ];
  }
}

class FailingRetrievalClient implements RetrievalClient {
  async search(_input: RetrievalSearchInput): Promise<RetrievedChunk[]> {
    throw new Error('milvus unavailable');
  }
}

function buildHeaders(body: unknown) {
  return buildSignedHeaders({
    method: 'POST',
    path: '/v1/chat',
    body,
    secret: 'phase1-secret',
    userContext: {
      user_id: 'u-1',
      tenant_id: 't-1',
      roles: ['student'],
    },
  });
}

test('chat.smoke.test: /v1/chat streams token, citations and done event', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.S2S_HMAC_SECRET = 'phase1-secret';

  const app = await buildApp({
    chatGateway: new FakeChatGateway(),
    retrievalClient: new FakeRetrievalClient(),
  });

  const requestBody = {
    messages: [{ role: 'user', content: 'Moi' }],
  };

  const response = await app.inject({
    method: 'POST',
    url: '/v1/chat',
    headers: buildHeaders(requestBody),
    payload: requestBody,
  });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers['content-type'] ?? ''), /text\/event-stream/i);

  const body = response.body;
  assert.match(body, /event: token/);
  assert.match(body, /data: {"t":"Hei"}/);
  assert.match(body, /data: {"t":" maailma"}/);
  assert.match(body, /Lahteet:/);
  assert.match(body, /Exchange handbook\.pdf/);
  assert.match(body, /event: done/);
  assert.match(body, /data: {"ok":true}/);

  await app.close();
});

test('chat.smoke.test: /v1/chat emits RAG_UNAVAILABLE when retrieval fails', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.S2S_HMAC_SECRET = 'phase1-secret';

  const app = await buildApp({
    chatGateway: new FakeChatGateway(),
    retrievalClient: new FailingRetrievalClient(),
  });

  const requestBody = {
    messages: [{ role: 'user', content: 'Moi' }],
  };

  const response = await app.inject({
    method: 'POST',
    url: '/v1/chat',
    headers: buildHeaders(requestBody),
    payload: requestBody,
  });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers['content-type'] ?? ''), /text\/event-stream/i);
  assert.match(response.body, /event: error/);
  assert.match(response.body, /RAG_UNAVAILABLE/);
  assert.doesNotMatch(response.body, /event: done/);

  await app.close();
});