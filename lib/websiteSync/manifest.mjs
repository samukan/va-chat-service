import fs from 'node:fs';
import path from 'node:path';

export function createEmptyManifest() {
  return {
    version: 2,
    pages: {},
  };
}

function normalizePageEntry(entry) {
  const safeEntry = entry && typeof entry === 'object' ? entry : {};
  const versions =
    safeEntry.versions && typeof safeEntry.versions === 'object'
      ? safeEntry.versions
      : {};

  if (
    safeEntry.content_hash &&
    !versions[safeEntry.content_hash] &&
    Array.isArray(safeEntry.uploaded_chunk_ids)
  ) {
    versions[safeEntry.content_hash] = {
      uploaded_at: safeEntry.uploaded_at || null,
      chunk_count: safeEntry.chunk_count || 0,
      uploaded_file_ids: safeEntry.uploaded_chunk_ids || [],
      uploaded_vector_store_file_ids:
        safeEntry.uploaded_vector_store_file_ids || [],
    };
  }

  return {
    ...safeEntry,
    versions,
    uploaded_chunk_ids: safeEntry.uploaded_chunk_ids || [],
    uploaded_vector_store_file_ids:
      safeEntry.uploaded_vector_store_file_ids || [],
  };
}

export function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return createEmptyManifest();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return createEmptyManifest();
    }

    return {
      version: 2,
      pages:
        parsed.pages && typeof parsed.pages === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.pages).map(([url, entry]) => [
                url,
                normalizePageEntry(entry),
              ])
            )
          : {},
    };
  } catch {
    return createEmptyManifest();
  }
}

export function writeManifest(manifestPath, manifest) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function decideUploadAction({
  existingEntry,
  currentContentHash,
  privacy,
  includePrivate,
  replaceMode,
}) {
  if (privacy === 'user' && !includePrivate) {
    return {
      action: 'skip_private',
      reason: 'Private page (privacy=user) is skipped by default.',
    };
  }

  if (existingEntry && existingEntry.content_hash === currentContentHash) {
    return {
      action: 'skip_unchanged',
      reason: 'Content hash unchanged since last upload.',
    };
  }

  const normalized = normalizePageEntry(existingEntry);
  if (replaceMode && normalized.content_hash && normalized.content_hash !== currentContentHash) {
    const previousVersion = normalized.versions[normalized.content_hash] || {};
    return {
      action: 'upload_replace',
      reason: 'Content hash changed; replace mode will delete previous chunk IDs after successful upload.',
      previous: {
        previous_hash: normalized.content_hash,
        uploaded_file_ids: previousVersion.uploaded_file_ids || normalized.uploaded_chunk_ids || [],
        uploaded_vector_store_file_ids:
          previousVersion.uploaded_vector_store_file_ids ||
          normalized.uploaded_vector_store_file_ids || [],
      },
    };
  }

  return {
    action: 'upload',
    reason: 'New or changed content hash.',
  };
}

export function updateManifestPage({
  manifest,
  pageUrl,
  contentHash,
  chunkCount,
  uploadedChunkIds,
  uploadedVectorStoreFileIds,
  uploadSucceeded,
  nowIso,
}) {
  const previous = normalizePageEntry(manifest.pages[pageUrl]);

  const nextVersions = {
    ...previous.versions,
  };

  if (uploadSucceeded) {
    nextVersions[contentHash] = {
      uploaded_at: nowIso,
      chunk_count: chunkCount,
      uploaded_file_ids: uploadedChunkIds || [],
      uploaded_vector_store_file_ids: uploadedVectorStoreFileIds || [],
    };
  }

  manifest.pages[pageUrl] = {
    ...previous,
    versions: nextVersions,
    last_seen: nowIso,
    content_hash: contentHash,
    chunk_count: chunkCount,
    uploaded_at: uploadSucceeded ? nowIso : previous.uploaded_at || null,
    uploaded_chunk_ids:
      uploadSucceeded
        ? uploadedChunkIds || []
        : previous.uploaded_chunk_ids || [],
    uploaded_vector_store_file_ids:
      uploadSucceeded
        ? uploadedVectorStoreFileIds || []
        : previous.uploaded_vector_store_file_ids || [],
  };
}
