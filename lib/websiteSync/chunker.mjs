import crypto from 'node:crypto';
import { normalizeWhitespace } from './extract.mjs';
import { isProfilePath } from './url.mjs';

function splitBySentence(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
}

function chunkByWindow(text, maxChars, overlapChars) {
  const chunks = [];
  const value = normalizeWhitespace(text);
  if (!value) {
    return chunks;
  }

  let start = 0;
  while (start < value.length) {
    const end = Math.min(start + maxChars, value.length);
    const chunkText = value.slice(start, end).trim();
    if (chunkText) {
      chunks.push(chunkText);
    }
    if (end >= value.length) {
      break;
    }
    start = Math.max(0, end - overlapChars);
  }

  return chunks;
}

function splitSectionsByHeadings(text, headings) {
  const normalizedText = normalizeWhitespace(text);
  const normalizedHeadings = (headings || [])
    .map((heading) => normalizeWhitespace(heading))
    .filter((heading) => heading.length >= 2);

  if (normalizedHeadings.length === 0 || !normalizedText) {
    return [{ heading: undefined, text: normalizedText }];
  }

  const positions = [];
  let cursor = 0;
  for (const heading of normalizedHeadings) {
    const index = normalizedText.indexOf(heading, cursor);
    if (index === -1) {
      continue;
    }
    positions.push({ heading, index });
    cursor = index + heading.length;
  }

  if (positions.length === 0) {
    return [{ heading: undefined, text: normalizedText }];
  }

  const sections = [];

  if (positions[0].index > 0) {
    sections.push({
      heading: undefined,
      text: normalizeWhitespace(normalizedText.slice(0, positions[0].index)),
    });
  }

  for (let index = 0; index < positions.length; index += 1) {
    const current = positions[index];
    const next = positions[index + 1];
    const sectionText = normalizeWhitespace(
      normalizedText.slice(current.index, next ? next.index : undefined)
    );

    sections.push({
      heading: current.heading,
      text: sectionText,
    });
  }

  return sections.filter((section) => section.text);
}

function chunkSection(section, targetChars, maxChars, overlapChars) {
  const value = normalizeWhitespace(section.text);
  if (!value) {
    return [];
  }

  if (value.length <= maxChars) {
    return [{ text: value, sectionHeading: section.heading }];
  }

  const units = splitBySentence(value);
  if (units.length <= 1) {
    return chunkByWindow(value, maxChars, overlapChars).map((chunkText) => ({
      text: chunkText,
      sectionHeading: section.heading,
    }));
  }

  const chunks = [];
  let buffer = '';

  const flushBuffer = () => {
    const normalized = normalizeWhitespace(buffer);
    if (normalized) {
      chunks.push({ text: normalized, sectionHeading: section.heading });
    }
    buffer = '';
  };

  for (const unit of units) {
    const candidate = buffer ? `${buffer} ${unit}` : unit;
    if (candidate.length <= maxChars) {
      buffer = candidate;
      continue;
    }

    if (buffer && buffer.length >= Math.floor(targetChars * 0.6)) {
      flushBuffer();
    }

    if (unit.length > maxChars) {
      const hardChunks = chunkByWindow(unit, maxChars, overlapChars);
      for (const hardChunk of hardChunks) {
        chunks.push({ text: hardChunk, sectionHeading: section.heading });
      }
      buffer = '';
      continue;
    }

    buffer = unit;
  }

  flushBuffer();
  return chunks;
}

export function computeContentHash(text) {
  const normalized = normalizeWhitespace(text);
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function chunkWebsiteText({ text, headings = [], targetChars = 1200, maxChars = 1600, overlapChars = 80 }) {
  const normalizedText = normalizeWhitespace(text);
  if (!normalizedText) {
    return [];
  }

  const safeTarget = Math.max(300, Math.floor(targetChars));
  const safeMax = Math.max(safeTarget, Math.floor(maxChars));
  const safeOverlap = Math.max(0, Math.min(120, Math.floor(overlapChars)));

  const sections = splitSectionsByHeadings(normalizedText, headings);
  const chunks = [];
  for (const section of sections) {
    const sectionChunks = chunkSection(section, safeTarget, safeMax, safeOverlap);
    chunks.push(...sectionChunks);
  }

  return chunks.filter((chunk) => chunk.text);
}

export function buildWebsiteChunkRecords({ url, title, text, headings = [], targetChars, maxChars, overlapChars }) {
  const canonical = new URL(url);
  const path = `${canonical.pathname}${canonical.search}`;
  const privacy = isProfilePath(url) ? 'user' : undefined;
  const contentHash = computeContentHash(text);
  const chunkBodies = chunkWebsiteText({
    text,
    headings,
    targetChars,
    maxChars,
    overlapChars,
  });

  const chunkCount = chunkBodies.length;
  const chunks = chunkBodies.map((chunk, index) => ({
    text: chunk.text,
    metadata: {
      source_type: 'website',
      url: canonical.toString(),
      title,
      path,
      content_hash: contentHash,
      chunk_index: index,
      chunk_count: chunkCount,
      ...(chunk.sectionHeading ? { section_heading: chunk.sectionHeading } : {}),
      ...(privacy ? { privacy } : {}),
    },
  }));

  return {
    contentHash,
    chunkCount,
    chunks,
    privacy,
  };
}
