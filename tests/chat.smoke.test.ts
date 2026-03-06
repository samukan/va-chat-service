import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChatGateway, ChatRunInput } from '../src/llm/openaiChatGateway.js';
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

test('chat.smoke.test: /v1/chat streams token events and done event', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.S2S_HMAC_SECRET = 'phase1-secret';
  process.env.RAG_ENABLED = '0';
  process.env.INJECT_CONTEXT_ENABLED = '0';

  const app = await buildApp({ chatGateway: new FakeChatGateway() });

  const requestBody = {
    messages: [{ role: 'user', content: 'Moi' }]
  };

  const headers = buildSignedHeaders({
    method: 'POST',
    path: '/v1/chat',
    body: requestBody,
    secret: 'phase1-secret',
    userContext: {
      user_id: 'u-1',
      tenant_id: 't-1',
      roles: ['student']
    }
  });

  const response = await app.inject({
    method: 'POST',
    url: '/v1/chat',
    headers,
    payload: requestBody
  });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers['content-type'] ?? ''), /text\/event-stream/i);

  const body = response.body;
  assert.match(body, /event: token/);
  assert.match(body, /data: {"t":"Hei"}/);
  assert.match(body, /data: {"t":" maailma"}/);
  assert.match(body, /event: done/);
  assert.match(body, /data: {"ok":true}/);

  await app.close();
});
