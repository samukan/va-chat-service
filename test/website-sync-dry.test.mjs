import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWebsiteChunkRecords,
  chunkWebsiteText,
  computeContentHash,
} from '../lib/websiteSync/chunker.mjs';
import {
  normalizeCanonicalUrl,
  parseAllowlistUrls,
  resolveAllowlistedUrls,
} from '../lib/websiteSync/url.mjs';

test('parseAllowlistUrls parses comma-separated paths', () => {
  const parsed = parseAllowlistUrls(' /, /instructions, ,/contact ');
  assert.deepEqual(parsed, ['/', '/instructions', '/contact']);
});

test('normalizeCanonicalUrl removes fragment and tracking params but keeps business query', () => {
  const normalized = normalizeCanonicalUrl(
    'http://LOCALHOST:3000/profile/hakemukset?tab=budget&utm_source=test#section-a'
  );

  assert.equal(
    normalized,
    'http://localhost:3000/profile/hakemukset?tab=budget'
  );
});

test('resolveAllowlistedUrls resolves against base and de-duplicates', () => {
  const urls = resolveAllowlistedUrls('http://localhost:3000', [
    '/',
    '/instructions/',
    'http://localhost:3000/instructions#intro',
  ]);

  assert.deepEqual(urls, [
    'http://localhost:3000/',
    'http://localhost:3000/instructions',
  ]);
});

test('chunkWebsiteText creates multiple chunks for long text within max bound', () => {
  const longText = Array.from({ length: 80 }, (_, index) =>
    `Paragraph ${index + 1}. Tämä on testiteksti chunkkausta varten.`
  ).join(' ');

  const chunks = chunkWebsiteText({
    text: longText,
    headings: ['Intro', 'Details'],
    targetChars: 1200,
    maxChars: 1600,
    overlapChars: 80,
  });

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 1600));
});

test('chunkWebsiteText applies overlap in hard-window mode', () => {
  const text = 'x'.repeat(3400);
  const overlapChars = 80;
  const chunks = chunkWebsiteText({
    text,
    headings: [],
    targetChars: 1200,
    maxChars: 1300,
    overlapChars,
  });

  assert.ok(chunks.length >= 3);
  const firstTail = chunks[0].text.slice(-overlapChars);
  const secondHead = chunks[1].text.slice(0, overlapChars);
  assert.equal(firstTail, secondHead);
});

test('computeContentHash is stable for same normalized content', () => {
  const a = computeContentHash('  Hello   world\n\nThis is a test.  ');
  const b = computeContentHash('Hello world This is a test.');
  assert.equal(a, b);
});

test('buildWebsiteChunkRecords produces metadata shape and profile privacy', () => {
  const records = buildWebsiteChunkRecords({
    url: 'http://localhost:3000/profile/hakemukset?tab=budget',
    title: 'Hakemukset',
    text: Array.from({ length: 30 }, () => 'Budjettirivi ja perustelu.').join(' '),
    headings: ['Hakemus', 'Budjetti'],
    targetChars: 400,
    maxChars: 500,
    overlapChars: 40,
  });

  assert.ok(records.chunkCount > 0);
  assert.equal(records.privacy, 'user');
  assert.match(records.contentHash, /^[a-f0-9]{64}$/);

  const first = records.chunks[0];
  assert.equal(first.metadata.source_type, 'website');
  assert.equal(first.metadata.url, 'http://localhost:3000/profile/hakemukset?tab=budget');
  assert.equal(first.metadata.path, '/profile/hakemukset?tab=budget');
  assert.equal(first.metadata.title, 'Hakemukset');
  assert.equal(first.metadata.privacy, 'user');
  assert.equal(first.metadata.chunk_index, 0);
  assert.equal(first.metadata.chunk_count, records.chunkCount);
  assert.equal(first.metadata.content_hash, records.contentHash);
});
