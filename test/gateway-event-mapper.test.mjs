import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSourcesSuffix,
  mapOpenAIEventToFrontendSse,
} from '../lib/gateway/openaiEventMapper.js';

test('maps response.output_text.delta to frontend SSE event', () => {
  const mapped = mapOpenAIEventToFrontendSse({
    type: 'response.output_text.delta',
    delta: 'Hei',
  });

  assert.equal(mapped.sse?.event, 'response.output_text.delta');
  assert.equal(mapped.sse?.data?.delta, 'Hei');
  assert.equal(mapped.deltaText, 'Hei');
  assert.equal(mapped.done, false);
});

test('maps error to frontend error SSE event', () => {
  const mapped = mapOpenAIEventToFrontendSse({
    type: 'error',
    error: {message: 'Boom'},
  });

  assert.equal(mapped.sse?.event, 'error');
  assert.equal(mapped.sse?.data?.error?.message, 'Boom');
  assert.equal(mapped.done, false);
});

test('extracts source-like strings and formats citation suffix', () => {
  const mapped = mapOpenAIEventToFrontendSse({
    type: 'response.file_search_call.completed',
    output: [
      {
        filename: 'opas.pdf',
        url: 'https://example.org/doc',
      },
    ],
  });

  assert.deepEqual(mapped.sources.sort(), ['https://example.org/doc', 'opas.pdf']);

  const suffix = buildSourcesSuffix(mapped.sources);
  assert.match(suffix, /^\n\nLähteet:\n-/);
  assert.match(suffix, /opas\.pdf/);
});
