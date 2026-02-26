import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyManifest,
  decideUploadAction,
  readManifest,
  updateManifestPage,
  writeManifest,
} from '../lib/websiteSync/manifest.mjs';

test('manifest read/write/update persists expected shape', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'va-website-sync-'));
  const manifestPath = path.join(tempDir, 'website-sync-manifest.json');

  const manifest = createEmptyManifest();
  updateManifestPage({
    manifest,
    pageUrl: 'http://localhost:3000/instructions',
    contentHash: 'abc123',
    chunkCount: 3,
    uploadedChunkIds: ['file_1', 'file_2'],
    uploadedVectorStoreFileIds: ['vsf_1', 'vsf_2'],
    uploadSucceeded: true,
    nowIso: '2026-02-24T12:00:00.000Z',
  });

  writeManifest(manifestPath, manifest);
  const loaded = readManifest(manifestPath);

  const entry = loaded.pages['http://localhost:3000/instructions'];
  assert.equal(entry.content_hash, 'abc123');
  assert.equal(entry.chunk_count, 3);
  assert.deepEqual(entry.uploaded_chunk_ids, ['file_1', 'file_2']);
  assert.deepEqual(entry.uploaded_vector_store_file_ids, ['vsf_1', 'vsf_2']);
  assert.equal(entry.last_seen, '2026-02-24T12:00:00.000Z');
  assert.equal(entry.uploaded_at, '2026-02-24T12:00:00.000Z');
  assert.deepEqual(entry.versions.abc123.uploaded_file_ids, ['file_1', 'file_2']);
});

test('dedupe decision skips unchanged and uploads changed', () => {
  const unchanged = decideUploadAction({
    existingEntry: { content_hash: 'same' },
    currentContentHash: 'same',
    privacy: undefined,
    includePrivate: false,
  });

  const changed = decideUploadAction({
    existingEntry: { content_hash: 'old' },
    currentContentHash: 'new',
    privacy: undefined,
    includePrivate: false,
    replaceMode: false,
  });

  assert.equal(unchanged.action, 'skip_unchanged');
  assert.equal(changed.action, 'upload');
});

test('privacy skip default blocks profile uploads unless explicitly allowed', () => {
  const skipPrivate = decideUploadAction({
    existingEntry: null,
    currentContentHash: 'hash',
    privacy: 'user',
    includePrivate: false,
  });

  const includePrivate = decideUploadAction({
    existingEntry: null,
    currentContentHash: 'hash',
    privacy: 'user',
    includePrivate: true,
    replaceMode: false,
  });

  assert.equal(skipPrivate.action, 'skip_private');
  assert.equal(includePrivate.action, 'upload');
});

test('replace mode returns old ids when hash changes', () => {
  const action = decideUploadAction({
    existingEntry: {
      content_hash: 'oldhash',
      uploaded_chunk_ids: ['file_old_1'],
      uploaded_vector_store_file_ids: ['vsf_old_1'],
      versions: {
        oldhash: {
          uploaded_file_ids: ['file_old_1', 'file_old_2'],
          uploaded_vector_store_file_ids: ['vsf_old_1', 'vsf_old_2'],
        },
      },
    },
    currentContentHash: 'newhash',
    privacy: 'public',
    includePrivate: true,
    replaceMode: true,
  });

  assert.equal(action.action, 'upload_replace');
  assert.deepEqual(action.previous.uploaded_file_ids, ['file_old_1', 'file_old_2']);
  assert.deepEqual(action.previous.uploaded_vector_store_file_ids, ['vsf_old_1', 'vsf_old_2']);
});
