import fs from 'node:fs';
import { chromium } from 'playwright';
import { buildWebsiteChunkRecords } from './chunker.mjs';
import { getWebsiteSyncConfig, resolveStorageStatePath } from './config.mjs';
import {
  buildPreview,
  detectAuthOrLoadingState,
  extractMainContent,
} from './extract.mjs';
import { isProfilePath, normalizeCanonicalUrl, resolveAllowlistedUrls } from './url.mjs';

const PROFILE_WARNING =
  'This may contain user data; do not upload to shared vector store.';

function printPageResult(result) {
  const {
    status,
    url,
    title,
    textLength,
    preview,
    reason,
    isProfile,
    contentHash,
    chunkCount,
    privacy,
    sampleChunkMetadata,
    showChunks,
  } = result;

  console.log(`[${status}] ${url}`);
  console.log(`  title: ${title || '(untitled)'}`);
  console.log(`  text_length: ${textLength}`);
  console.log(`  content_hash: ${contentHash || '-'}`);
  console.log(`  chunk_count: ${chunkCount ?? 0}`);
  if (privacy) {
    console.log(`  privacy: ${privacy}`);
  }
  console.log(`  preview: ${preview || '(empty)'}`);
  console.log(`  status: ${status}`);

  if (reason) {
    console.log(`  reason: ${reason}`);
  }

  if (isProfile) {
    console.log(`  WARNING: ${PROFILE_WARNING}`);
  }

  if (showChunks && sampleChunkMetadata && sampleChunkMetadata.length > 0) {
    console.log('  chunks:');
    for (const metadata of sampleChunkMetadata) {
      console.log(`    - ${JSON.stringify(metadata)}`);
    }
  }
}

function buildMissingStorageResults(urls, storageStatePath) {
  return urls.map((url) => ({
    url,
    title: '(not loaded)',
    textLength: 0,
    contentHash: '-',
    chunkCount: 0,
    privacy: isProfilePath(url) ? 'user' : undefined,
    sampleChunkMetadata: [],
    showChunks: false,
    preview: '',
    status: 'FAILED_AUTH_OR_LOGIN',
    reason: `Storage state missing at ${storageStatePath}`,
    isProfile: isProfilePath(url),
  }));
}

export async function runWebsiteSyncDry() {
  const config = getWebsiteSyncConfig();
  const urls = resolveAllowlistedUrls(config.baseUrl, config.crawlUrls);

  if (urls.length === 0) {
    console.error('No WEBSITE_CRAWL_URLS configured.');
    process.exitCode = 1;
    return;
  }

  const storageStatePath = resolveStorageStatePath(config);
  const hasStorageState = fs.existsSync(storageStatePath);

  if (!hasStorageState) {
    const failed = buildMissingStorageResults(urls, storageStatePath);
    for (const result of failed) {
      printPageResult(result);
    }
    console.log('');
    console.log(
      'Storage state is missing or expired. Re-run: npm run website:auth:record'
    );
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath });
  const page = await context.newPage();

  const results = [];

  try {
    for (const targetUrl of urls) {
      let status = 'OK';
      let reason = '';
      let title = '(untitled)';
      let text = '';
      let pageTextLength = 0;
      let canonicalUrl = targetUrl;
      let headings = [];
      let contentHash = '-';
      let chunkCount = 0;
      let privacy;
      let sampleChunkMetadata = [];

      try {
        await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: config.renderTimeoutMs,
        });

        await page
          .waitForLoadState('networkidle', { timeout: config.renderTimeoutMs })
          .catch(() => undefined);

        const extracted = await extractMainContent(page, config.extractSelector);
        title = extracted.title;
        text = extracted.text;
        pageTextLength = text.length;
        headings = extracted.headings || [];
        canonicalUrl = normalizeCanonicalUrl(page.url());

        const detected = detectAuthOrLoadingState({
          finalUrl: canonicalUrl,
          title,
          text,
          loadingPatterns: config.loadingTextPatterns,
        });

        status = detected.status;
        reason = detected.reason;

        if (status === 'OK') {
          const chunked = buildWebsiteChunkRecords({
            url: canonicalUrl,
            title,
            text,
            headings,
            targetChars: config.chunkTargetChars,
            maxChars: config.chunkMaxChars,
            overlapChars: config.chunkOverlapChars,
          });

          contentHash = chunked.contentHash.slice(0, 12);
          chunkCount = chunked.chunkCount;
          privacy = chunked.privacy;
          sampleChunkMetadata = chunked.chunks
            .slice(0, 2)
            .map((chunk) => chunk.metadata);
          if (chunkCount > 0) {
            if (privacy === 'user' && !config.debug) {
              reason = reason || 'Profile content preview hidden (set DEBUG=1 to show).';
            } else {
              text = chunked.chunks[0].text;
            }
          }
        }
      } catch (error) {
        status = 'ERROR';
        reason = error instanceof Error ? error.message : String(error);
      }

      const result = {
        url: canonicalUrl,
        title,
        textLength: pageTextLength,
        contentHash,
        chunkCount,
        privacy,
        sampleChunkMetadata,
        showChunks: config.dryRunShowChunks,
        preview:
          privacy === 'user' && !config.debug
            ? '(hidden for privacy)'
            : buildPreview(text),
        status,
        reason,
        isProfile: isProfilePath(canonicalUrl),
      };

      results.push(result);
      printPageResult(result);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const failedAuthCount = results.filter(
    (item) => item.status === 'FAILED_AUTH_OR_LOGIN'
  ).length;
  const errorCount = results.filter((item) => item.status === 'ERROR').length;

  console.log('');
  console.log(
    `Summary: ${results.length} pages checked, ${failedAuthCount} auth/login failures, ${errorCount} errors.`
  );

  if (failedAuthCount > 0) {
    console.log('If auth appears expired, re-run: npm run website:auth:record');
    process.exitCode = 1;
  }
}
