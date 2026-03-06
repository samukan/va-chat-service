import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChatGateway, ChatRunInput } from '../src/llm/openaiChatGateway.js';
import { buildApp } from '../src/app.js';

class FakeChatGateway implements ChatGateway {
  async *streamText(_input: ChatRunInput): AsyncIterable<string> {
    yield 'test';
  }

  async checkDependency() {
    return { ok: true };
  }
}

test('auth.smoke.test: /v1/chat without S2S headers is rejected', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.S2S_HMAC_SECRET = 'phase1-secret';

  const app = await buildApp({ chatGateway: new FakeChatGateway() });

  const response = await app.inject({
    method: 'POST',
    url: '/v1/chat',
    headers: {
      'content-type': 'application/json'
    },
    payload: {
      messages: [{ role: 'user', content: 'Moi' }]
    }
  });

  assert.equal(response.statusCode, 401);
  assert.match(response.body, /S2S_HEADERS_MISSING/);

  await app.close();
});
