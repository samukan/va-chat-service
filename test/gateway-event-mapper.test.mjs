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

  const suffix = buildSourcesSuffix(mapped.sources);
  assert.match(suffix, /^\n\nLähteet:\n-/);
  assert.match(suffix, /opas\.pdf/);
});

test('prefers website citations with title and url when metadata indicates website source', () => {
  const mapped = mapOpenAIEventToFrontendSse({
    type: 'response.file_search_call.completed',
    output: [
      {
        filename: 'localhost-instructions-chunk-0001.txt',
        attributes: {
          source_type: 'website',
          url: 'https://site.example/instructions',
          title: 'Ohjeet',
          path: '/instructions',
        },
      },
    ],
  });

  const suffix = buildSourcesSuffix(mapped.sources);
  assert.match(suffix, /Ohjeet: https:\/\/site\.example\/instructions/);
  assert.doesNotMatch(suffix, /localhost-instructions-chunk-0001\.txt/);
});

test('uses attributes source_type/url first and suppresses chunk filename citation', () => {
  const mapped = mapOpenAIEventToFrontendSse({
    type: 'response.file_search_call.completed',
    output: [
      {
        filename: 'localhost-instructions-chunk-0010.txt',
        metadata: {
          source_type: 'file',
          title: 'Wrong fallback title',
        },
        attributes: {
          source_type: 'website',
          url: 'http://localhost:3000/instructions',
          title: 'Instructions',
        },
      },
    ],
  });

  const suffix = buildSourcesSuffix(mapped.sources);
  assert.match(suffix, /Instructions: http:\/\/localhost:3000\/instructions/);
  assert.doesNotMatch(suffix, /localhost-instructions-chunk-0010\.txt/);
});

test('keeps fallback behavior for pdf-only sources', () => {
  const mapped = mapOpenAIEventToFrontendSse({
    type: 'response.file_search_call.completed',
    output: [
      {
        filename: 'vaihto-opas.pdf',
      },
      {
        filename: 'vaihto-opas.pdf',
      },
    ],
  });

  const suffix = buildSourcesSuffix(mapped.sources);
  assert.match(suffix, /Lähteet:/);
  assert.match(suffix, /- vaihto-opas\.pdf/);
  const count = (suffix.match(/vaihto-opas\.pdf/g) || []).length;
  assert.equal(count, 1);
});

test('includes both website urls and pdf names for mixed sources', () => {
  const mapped = mapOpenAIEventToFrontendSse({
    type: 'response.file_search_call.completed',
    output: [
      {
        filename: 'inst-chunk.txt',
        metadata: {
          source_type: 'website',
          url: 'https://site.example/instructions',
          title: 'Instructions',
        },
      },
      {
        filename: 'exchange-guide.pdf',
      },
    ],
  });

  const suffix = buildSourcesSuffix(mapped.sources);
  assert.match(suffix, /Instructions: https:\/\/site\.example\/instructions/);
  assert.match(suffix, /exchange-guide\.pdf/);
});
