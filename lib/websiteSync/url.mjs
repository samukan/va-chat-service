const TRACKING_PREFIXES = ['utm_'];
const TRACKING_KEYS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid']);

export function parseAllowlistUrls(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeCanonicalUrl(input) {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(String(input));

  url.hostname = url.hostname.toLowerCase();
  url.hash = '';

  for (const key of Array.from(url.searchParams.keys())) {
    const lowerKey = key.toLowerCase();
    if (TRACKING_KEYS.has(lowerKey) || TRACKING_PREFIXES.some((prefix) => lowerKey.startsWith(prefix))) {
      url.searchParams.delete(key);
    }
  }

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/g, '');
  }

  if (url.protocol === 'https:' && url.port === '443') {
    url.port = '';
  }
  if (url.protocol === 'http:' && url.port === '80') {
    url.port = '';
  }

  return url.toString();
}

export function resolveAllowlistedUrls(baseUrl, allowlistItems) {
  const items = parseAllowlistUrls(allowlistItems);
  const seen = new Set();
  const resolved = [];

  for (const item of items) {
    const absolute = new URL(item, baseUrl);
    const canonical = normalizeCanonicalUrl(absolute);
    if (!seen.has(canonical)) {
      seen.add(canonical);
      resolved.push(canonical);
    }
  }

  return resolved;
}

export function isProfilePath(urlString) {
  const url = new URL(urlString);
  return url.pathname.startsWith('/profile/');
}
