import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVectorStoreAttributes,
  buildVectorStoreBatchFileItem,
} from '../lib/websiteSync/sync.mjs';

test('buildVectorStoreBatchFileItem uses attributes and not metadata', () => {
  const item = buildVectorStoreBatchFileItem('file_abc', {
    source_type: 'website',
    url: 'https://site.example/instructions',
    title: 'Ohjeet',
    path: '/instructions',
    content_hash: 'abc123',
    chunk_index: 0,
    chunk_count: 5,
  });

  assert.equal(item.file_id, 'file_abc');
  assert.ok(item.attributes);
  assert.equal('metadata' in item, false);
  assert.equal(item.attributes.source_type, 'website');
  assert.equal(item.attributes.url, 'https://site.example/instructions');
});

test('buildVectorStoreAttributes enforces limits and preserves url', () => {
  const longTitle = 'T'.repeat(700);
  const longSection = 'S'.repeat(700);

  const attributes = buildVectorStoreAttributes({
    source_type: 'website',
    url: 'https://site.example/very/long/url?with=query&values=1',
    title: longTitle,
    path: '/instructions',
    content_hash: 'deadbeef',
    chunk_index: 2,
    chunk_count: 10,
    section_heading: longSection,
    privacy: 'user',
  });

  assert.equal(Object.keys(attributes).length <= 16, true);
  assert.equal(attributes.url, 'https://site.example/very/long/url?with=query&values=1');
  assert.equal(typeof attributes.chunk_index, 'number');
  assert.equal(typeof attributes.chunk_count, 'number');
  assert.equal(attributes.title.length <= 512, true);
  assert.equal(attributes.section_heading.length <= 512, true);
  assert.equal(attributes.privacy, 'user');
});
