export function normalizeWhitespace(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

export function buildPreview(text, max = 200) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, max).trim()}…`;
}

function isLikelyLoginUrl(urlString) {
  const lower = String(urlString || '').toLowerCase();
  return (
    lower.includes('accounts.google.com') ||
    lower.includes('/login') ||
    lower.includes('/signin') ||
    lower.includes('/oauth')
  );
}

export function detectAuthOrLoadingState({ finalUrl, title, text, loadingPatterns }) {
  const haystack = `${title || ''}\n${text || ''}`.toLowerCase();
  const matchedPattern = (loadingPatterns || []).find((pattern) =>
    haystack.includes(String(pattern).toLowerCase())
  );

  if (isLikelyLoginUrl(finalUrl)) {
    return {
      status: 'FAILED_AUTH_OR_LOGIN',
      reason: `Redirected to login/auth URL: ${finalUrl}`,
    };
  }

  if (matchedPattern) {
    return {
      status: 'FAILED_AUTH_OR_LOGIN',
      reason: `Detected login/loading marker: "${matchedPattern}"`,
    };
  }

  if (normalizeWhitespace(text).length < 20) {
    return {
      status: 'FAILED_LOADING',
      reason: 'Extracted content is empty or too short (<20 chars).',
    };
  }

  return { status: 'OK', reason: '' };
}

export async function extractMainContent(page, selector = 'main') {
  const title = normalizeWhitespace(await page.title().catch(() => ''));

  const extractHeadings = async (cssSelector) => {
    const locator = page.locator(`${cssSelector} h1, ${cssSelector} h2, ${cssSelector} h3`);
    const count = await locator.count().catch(() => 0);
    if (!count) {
      return [];
    }

    const headings = [];
    for (let index = 0; index < count; index += 1) {
      const heading = normalizeWhitespace(
        await locator
          .nth(index)
          .innerText({ timeout: 1500 })
          .catch(() => '')
      );

      if (heading) {
        headings.push(heading);
      }
    }

    return Array.from(new Set(headings));
  };

  const extractFrom = async (cssSelector) => {
    const locator = page.locator(cssSelector).first();
    const count = await locator.count().catch(() => 0);
    if (!count) {
      return '';
    }
    return normalizeWhitespace(await locator.innerText({ timeout: 3000 }).catch(() => ''));
  };

  let text = await extractFrom(selector);
  let usedSelector = selector;

  if (!text) {
    text = await extractFrom('body');
    usedSelector = 'body';
  }

  const headings = await extractHeadings(usedSelector);

  let resolvedTitle = title;
  if (!resolvedTitle) {
    resolvedTitle = await extractFrom('h1');
  }

  return {
    title: resolvedTitle || '(untitled)',
    text,
    usedSelector,
    headings,
  };
}
