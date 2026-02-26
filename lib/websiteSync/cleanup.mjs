import OpenAI from 'openai';
import { getWebsiteSyncConfig, resolveVectorStoreId } from './config.mjs';

function toEpoch(value) {
  if (typeof value === 'number') {
    return value;
  }

  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getWebsiteAttributes(file) {
  const attributes = file?.attributes && typeof file.attributes === 'object' ? file.attributes : null;
  if (!attributes) {
    return null;
  }

  if (String(attributes.source_type || '').toLowerCase() !== 'website') {
    return null;
  }

  if (typeof attributes.url !== 'string' || !attributes.url.trim()) {
    return null;
  }

  return {
    url: attributes.url.trim(),
    contentHash: String(attributes.content_hash || ''),
  };
}

export function buildCleanupPlan(files) {
  const groupedByUrl = new Map();

  for (const file of files || []) {
    const attrs = getWebsiteAttributes(file);
    if (!attrs) {
      continue;
    }

    const urlGroup = groupedByUrl.get(attrs.url) || new Map();
    const hashKey = attrs.contentHash || '__unknown_hash__';
    const list = urlGroup.get(hashKey) || [];
    list.push(file);
    urlGroup.set(hashKey, list);
    groupedByUrl.set(attrs.url, urlGroup);
  }

  const deletions = [];

  for (const [url, hashGroups] of groupedByUrl.entries()) {
    if (hashGroups.size <= 1) {
      continue;
    }

    const candidates = Array.from(hashGroups.entries()).map(([hash, groupFiles]) => ({
      hash,
      files: groupFiles,
      newest: Math.max(...groupFiles.map((file) => toEpoch(file.created_at))),
    }));

    candidates.sort((a, b) => b.newest - a.newest);
    const keep = candidates[0];

    for (const candidate of candidates.slice(1)) {
      for (const file of candidate.files) {
        deletions.push({
          url,
          keepHash: keep.hash,
          deleteHash: candidate.hash,
          vectorStoreFileId: file.id,
        });
      }
    }
  }

  return deletions;
}

async function listAllVectorStoreFiles(openai, vectorStoreId) {
  const files = [];
  let after;

  while (true) {
    const page = await openai.vectorStores.files.list(vectorStoreId, {
      limit: 100,
      ...(after ? { after } : {}),
    });

    const data = Array.isArray(page?.data) ? page.data : [];
    files.push(...data);

    if (!page?.has_more || data.length === 0) {
      break;
    }

    after = data[data.length - 1]?.id;
    if (!after) {
      break;
    }
  }

  return files;
}

export async function runWebsiteSyncCleanup() {
  const config = getWebsiteSyncConfig();
  const vectorStoreId = resolveVectorStoreId();

  if (!vectorStoreId) {
    console.error('No vector store configured. Set RAG_VECTOR_STORE_ID or RAG_VECTOR_STORE_IDS.');
    process.exitCode = 1;
    return;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const files = await listAllVectorStoreFiles(openai, vectorStoreId);
  const deletions = buildCleanupPlan(files);

  console.log(`Cleanup candidates: ${deletions.length}`);
  for (const item of deletions) {
    console.log(
      `- url=${item.url} delete_hash=${item.deleteHash} keep_hash=${item.keepHash} id=${item.vectorStoreFileId}`
    );
  }

  if (config.syncDryRun) {
    console.log('WEBSITE_SYNC_DRY_RUN=1 -> no deletions performed.');
    return;
  }

  let deleted = 0;
  let failed = 0;
  for (const item of deletions) {
    try {
      if (typeof openai.vectorStores.files.del === 'function') {
        await openai.vectorStores.files.del(vectorStoreId, item.vectorStoreFileId);
      } else {
        await openai.vectorStores.files.delete(vectorStoreId, item.vectorStoreFileId);
      }
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.log(
        `[CLEANUP_ERROR] id=${item.vectorStoreFileId} reason=${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  console.log(`Cleanup complete: deleted=${deleted} failed=${failed}`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}
