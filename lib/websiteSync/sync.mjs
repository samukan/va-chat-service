import fs from 'node:fs';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { chromium } from 'playwright';
import { buildWebsiteChunkRecords } from './chunker.mjs';
import {
  getWebsiteSyncConfig,
  resolveManifestPath,
  resolveStorageStatePath,
  resolveVectorStoreId,
} from './config.mjs';
import { detectAuthOrLoadingState, extractMainContent } from './extract.mjs';
import {
  decideUploadAction,
  readManifest,
  updateManifestPage,
  writeManifest,
} from './manifest.mjs';
import { normalizeCanonicalUrl, resolveAllowlistedUrls } from './url.mjs';

function sanitizeFilename(value) {
  return value.replace(/[^a-z0-9_.-]+/gi, '-').replace(/-+/g, '-').toLowerCase();
}

function toPathSlug(path) {
  return sanitizeFilename(String(path || '/').replace(/[/?=&]+/g, '-')).replace(/^-+|-+$/g, '') || 'root';
}

function truncateString(value, maxLength = 512) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function buildVectorStoreAttributes(metadata) {
  const privacyRaw = String(metadata?.privacy || '').trim().toLowerCase();
  const privacy = privacyRaw === 'user' ? 'user' : privacyRaw === 'public' ? 'public' : '';

  const attributes = {
    source_type: 'website',
    url: String(metadata?.url || '').trim(),
    title: truncateString(metadata?.title || ''),
    path: truncateString(metadata?.path || ''),
    content_hash: String(metadata?.content_hash || '').trim(),
    chunk_index: Number(metadata?.chunk_index ?? 0),
    chunk_count: Number(metadata?.chunk_count ?? 0),
    ...(metadata?.section_heading
      ? { section_heading: truncateString(metadata.section_heading) }
      : {}),
    ...(privacy ? { privacy } : {}),
  };

  const entries = Object.entries(attributes)
    .filter(([, value]) => value !== '' && value !== null && value !== undefined)
    .slice(0, 16)
    .map(([key, value]) => {
      const safeKey = String(key).slice(0, 64);

      if (typeof value === 'number' || typeof value === 'boolean') {
        return [safeKey, value];
      }

      if (safeKey === 'url') {
        return [safeKey, String(value).trim()];
      }

      return [safeKey, truncateString(value, 512)];
    });

  return Object.fromEntries(entries);
}

export function buildVectorStoreBatchFileItem(fileId, metadata) {
  return {
    file_id: fileId,
    attributes: buildVectorStoreAttributes(metadata),
  };
}

function buildChunkUploadText(chunk) {
  const metadata = chunk.metadata;
  const metadataLines = [
    'SOURCE_TYPE: website',
    `URL: ${metadata.url}`,
    `TITLE: ${metadata.title}`,
    `PATH: ${metadata.path}`,
    `CONTENT_HASH: ${metadata.content_hash}`,
    `CHUNK_INDEX: ${metadata.chunk_index}`,
    `CHUNK_COUNT: ${metadata.chunk_count}`,
  ];

  if (metadata.privacy) {
    metadataLines.push(`PRIVACY: ${metadata.privacy}`);
  }
  if (metadata.section_heading) {
    metadataLines.push(`SECTION_HEADING: ${metadata.section_heading}`);
  }

  return `${metadataLines.join('\n')}\n\n${chunk.text}`;
}

async function uploadChunkToVectorStore({ openai, vectorStoreId, pageUrl, chunk }) {
  const metadata = chunk.metadata;
  const hashPrefix = String(metadata.content_hash || '').slice(0, 16);
  const fileName = sanitizeFilename(
    `${new URL(pageUrl).hostname}-${toPathSlug(metadata.path)}-${hashPrefix}-chunk-${String(
      metadata.chunk_index + 1
    ).padStart(4, '0')}.txt`
  );

  const content = buildChunkUploadText(chunk);
  const blob = new Blob([content], { type: 'text/plain' });
  const createdFile = await openai.files.create({
    file: await toFile(blob, fileName),
    purpose: 'assistants',
  });

  const attached = await openai.vectorStores.files.create(vectorStoreId, {
    file_id: createdFile.id,
    attributes: buildVectorStoreAttributes(metadata),
  });

  return {
    fileId: createdFile.id,
    vectorStoreFileId: attached?.id || null,
  };
}

async function deleteOldUploads({ openai, vectorStoreId, fileIds = [], vectorStoreFileIds = [] }) {
  const errors = [];

  for (const vectorStoreFileId of vectorStoreFileIds) {
    try {
      if (!vectorStoreFileId) {
        continue;
      }
      if (typeof openai.vectorStores.files.del === 'function') {
        await openai.vectorStores.files.del(vectorStoreId, vectorStoreFileId);
      } else {
        await openai.vectorStores.files.delete(vectorStoreId, vectorStoreFileId);
      }
    } catch (error) {
      errors.push(`vector_store_file_id ${vectorStoreFileId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const fileId of fileIds) {
    try {
      if (!fileId) {
        continue;
      }
      if (typeof openai.files.del === 'function') {
        await openai.files.del(fileId);
      } else {
        await openai.files.delete(fileId);
      }
    } catch (error) {
      errors.push(`file_id ${fileId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return errors;
}

export async function runWebsiteSyncUpload() {
  const config = getWebsiteSyncConfig();
  const storageStatePath = resolveStorageStatePath(config);
  const manifestPath = resolveManifestPath(config);

  const vectorStoreId = resolveVectorStoreId();
  if (!vectorStoreId && !config.syncDryRun) {
    console.error('No vector store configured. Set RAG_VECTOR_STORE_ID or RAG_VECTOR_STORE_IDS.');
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(storageStatePath)) {
    console.error(`Storage state missing at ${storageStatePath}`);
    console.error('Run: npm run website:auth:record');
    process.exitCode = 1;
    return;
  }

  const allUrls = resolveAllowlistedUrls(config.baseUrl, config.crawlUrls);
  const urls =
    config.syncLimitPages > 0 ? allUrls.slice(0, config.syncLimitPages) : allUrls;

  const manifest = readManifest(manifestPath);
  const openai = config.syncDryRun ? null : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  if (config.syncDryRun) {
    console.log('WEBSITE_SYNC_DRY_RUN=1 -> upload calls are skipped.');
  }

  const summary = {
    totalPages: 0,
    uploadedPages: 0,
    skippedUnchanged: 0,
    skippedPrivate: 0,
    failed: 0,
    failures: [],
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath });
  const page = await context.newPage();

  try {
    for (const targetUrl of urls) {
      summary.totalPages += 1;
      const nowIso = new Date().toISOString();

      try {
        await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: config.renderTimeoutMs,
        });
        await page
          .waitForLoadState('networkidle', { timeout: config.renderTimeoutMs })
          .catch(() => undefined);

        const extracted = await extractMainContent(page, config.extractSelector);
        const canonicalUrl = normalizeCanonicalUrl(page.url());
        const detected = detectAuthOrLoadingState({
          finalUrl: canonicalUrl,
          title: extracted.title,
          text: extracted.text,
          loadingPatterns: config.loadingTextPatterns,
        });

        if (detected.status !== 'OK') {
          summary.failed += 1;
          summary.failures.push({ url: canonicalUrl, reason: detected.reason });
          console.log(`[${detected.status}] ${canonicalUrl} - ${detected.reason}`);
          continue;
        }

        const chunked = buildWebsiteChunkRecords({
          url: canonicalUrl,
          title: extracted.title,
          text: extracted.text,
          headings: extracted.headings || [],
          targetChars: config.chunkTargetChars,
          maxChars: config.chunkMaxChars,
          overlapChars: config.chunkOverlapChars,
        });

        const action = decideUploadAction({
          existingEntry: manifest.pages[canonicalUrl],
          currentContentHash: chunked.contentHash,
          privacy: chunked.privacy,
          includePrivate: config.includePrivate,
          replaceMode: config.syncReplace,
        });

        if (action.action === 'skip_private') {
          summary.skippedPrivate += 1;
          updateManifestPage({
            manifest,
            pageUrl: canonicalUrl,
            contentHash: chunked.contentHash,
            chunkCount: chunked.chunkCount,
            uploadedChunkIds: null,
            uploadedVectorStoreFileIds: null,
            uploadSucceeded: false,
            nowIso,
          });
          console.log(`[SKIP_PRIVATE] ${canonicalUrl} - ${action.reason}`);
          continue;
        }

        if (action.action === 'skip_unchanged') {
          summary.skippedUnchanged += 1;
          updateManifestPage({
            manifest,
            pageUrl: canonicalUrl,
            contentHash: chunked.contentHash,
            chunkCount: chunked.chunkCount,
            uploadedChunkIds: null,
            uploadedVectorStoreFileIds: null,
            uploadSucceeded: false,
            nowIso,
          });
          console.log(`[SKIP_UNCHANGED] ${canonicalUrl} - hash ${chunked.contentHash.slice(0, 12)}`);
          continue;
        }

        let uploadedChunkIds = [];
        let uploadedVectorStoreFileIds = [];
        if (!config.syncDryRun) {
          for (const chunk of chunked.chunks) {
            const uploaded = await uploadChunkToVectorStore({
              openai,
              vectorStoreId,
              pageUrl: canonicalUrl,
              chunk,
            });
            uploadedChunkIds.push(uploaded.fileId);
            if (uploaded.vectorStoreFileId) {
              uploadedVectorStoreFileIds.push(uploaded.vectorStoreFileId);
            }
          }
        }

        if (!config.syncDryRun && action.action === 'upload_replace' && action.previous) {
          const deleteErrors = await deleteOldUploads({
            openai,
            vectorStoreId,
            fileIds: action.previous.uploaded_file_ids || [],
            vectorStoreFileIds: action.previous.uploaded_vector_store_file_ids || [],
          });

          if (deleteErrors.length > 0) {
            summary.failed += 1;
            summary.failures.push({
              url: canonicalUrl,
              reason: `Uploaded new chunks but failed deleting old IDs: ${deleteErrors.join('; ')}`,
            });
          }
        }

        updateManifestPage({
          manifest,
          pageUrl: canonicalUrl,
          contentHash: chunked.contentHash,
          chunkCount: chunked.chunkCount,
          uploadedChunkIds,
          uploadedVectorStoreFileIds,
          uploadSucceeded: true,
          nowIso,
        });

        summary.uploadedPages += 1;
        console.log(
          `[UPLOADED] ${canonicalUrl} - chunks ${chunked.chunkCount} hash ${chunked.contentHash.slice(0, 12)}`
        );
      } catch (error) {
        summary.failed += 1;
        const reason = error instanceof Error ? error.message : String(error);
        summary.failures.push({ url: targetUrl, reason });
        console.log(`[ERROR] ${targetUrl} - ${reason}`);
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  writeManifest(manifestPath, manifest);

  console.log('');
  console.log('Website sync summary:');
  console.log(`- total pages processed: ${summary.totalPages}`);
  console.log(`- uploaded pages count: ${summary.uploadedPages}`);
  console.log(`- skipped unchanged count: ${summary.skippedUnchanged}`);
  console.log(`- skipped private count: ${summary.skippedPrivate}`);
  console.log(`- failed count: ${summary.failed}`);
  console.log(`- manifest: ${manifestPath}`);

  if (summary.failures.length > 0) {
    console.log('Failed pages:');
    for (const item of summary.failures) {
      console.log(`  - ${item.url}: ${item.reason}`);
    }
    process.exitCode = 1;
  }
}
