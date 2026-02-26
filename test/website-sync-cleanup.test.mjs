import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCleanupPlan } from '../lib/websiteSync/cleanup.mjs';

test('cleanup groups website files by url/hash and deletes older hash sets', () => {
  const files = [
    {
      id: 'vsf_old_1',
      created_at: 1700000000,
      attributes: {
        source_type: 'website',
        url: 'http://localhost:3000/instructions',
        content_hash: 'oldhash',
      },
    },
    {
      id: 'vsf_old_2',
      created_at: 1700000001,
      attributes: {
        source_type: 'website',
        url: 'http://localhost:3000/instructions',
        content_hash: 'oldhash',
      },
    },
    {
      id: 'vsf_new_1',
      created_at: 1700001000,
      attributes: {
        source_type: 'website',
        url: 'http://localhost:3000/instructions',
        content_hash: 'newhash',
      },
    },
    {
      id: 'vsf_contact_1',
      created_at: 1700001000,
      attributes: {
        source_type: 'website',
        url: 'http://localhost:3000/contact',
        content_hash: 'contacthash',
      },
    },
  ];

  const plan = buildCleanupPlan(files);
  const ids = plan.map((item) => item.vectorStoreFileId).sort();
  assert.deepEqual(ids, ['vsf_old_1', 'vsf_old_2']);
  assert.ok(plan.every((item) => item.url === 'http://localhost:3000/instructions'));
});
