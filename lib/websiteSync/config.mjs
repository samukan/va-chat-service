import path from 'node:path';

function parseCsv(value, fallback = []) {
  if (!value || typeof value !== 'string') {
    return fallback;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function getWebsiteSyncConfig(env = process.env) {
  const chunkTargetChars = Math.max(300, Math.floor(parseNumber(env.WEBSITE_CHUNK_TARGET_CHARS, 1200)));
  const chunkMaxChars = Math.max(chunkTargetChars, Math.floor(parseNumber(env.WEBSITE_CHUNK_MAX_CHARS, 1600)));
  const chunkOverlapChars = Math.max(
    0,
    Math.min(120, Math.floor(parseNumber(env.WEBSITE_CHUNK_OVERLAP_CHARS, 80)))
  );

  return {
    baseUrl: env.WEBSITE_BASE_URL?.trim() || 'http://localhost:3000',
    crawlUrls: parseCsv(
      env.WEBSITE_CRAWL_URLS,
      ['/', '/instructions', '/ai-chat', '/contact']
    ),
    storageStatePath: env.WEBSITE_STORAGE_STATE_PATH?.trim() || './storageState.json',
    manifestPath:
      env.WEBSITE_SYNC_MANIFEST_PATH?.trim() || './website-sync-manifest.json',
    syncLimitPages: Math.max(
      0,
      Math.floor(parseNumber(env.WEBSITE_SYNC_LIMIT_PAGES, 0))
    ),
    syncDryRun: parseBoolean(env.WEBSITE_SYNC_DRY_RUN, false),
    syncReplace: parseBoolean(env.WEBSITE_SYNC_REPLACE, false),
    includePrivate: parseBoolean(env.WEBSITE_SYNC_INCLUDE_PRIVATE, false),
    extractSelector: env.WEBSITE_EXTRACT_SELECTOR?.trim() || 'main',
    renderTimeoutMs: parseNumber(env.WEBSITE_RENDER_TIMEOUT_MS, 20000),
    loadingTextPatterns: parseCsv(
      env.WEBSITE_LOADING_TEXT_PATTERNS,
      ['Ladataan', 'Loading', 'Kirjaudu']
    ),
    loginStartPath: env.WEBSITE_LOGIN_START_PATH?.trim() || '/',
    headful: parseBoolean(env.HEADFUL, true),
    chunkTargetChars,
    chunkMaxChars,
    chunkOverlapChars,
    dryRunShowChunks: parseBoolean(env.WEBSITE_DRY_RUN_SHOW_CHUNKS, false),
    debug: parseBoolean(env.DEBUG, false),
  };
}

export function resolveStorageStatePath(config, cwd = process.cwd()) {
  const configured = config.storageStatePath;
  if (path.isAbsolute(configured)) {
    return configured;
  }

  return path.resolve(cwd, configured);
}

export function resolveManifestPath(config, cwd = process.cwd()) {
  const configured = config.manifestPath;
  if (path.isAbsolute(configured)) {
    return configured;
  }

  return path.resolve(cwd, configured);
}

export function resolveVectorStoreId(env = process.env) {
  const listFromPlural = env.RAG_VECTOR_STORE_IDS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (listFromPlural && listFromPlural.length > 0) {
    return listFromPlural[0];
  }

  return env.RAG_VECTOR_STORE_ID?.trim() || '';
}
