import './_loadEnv.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { getWebsiteSyncConfig, resolveStorageStatePath } from '../lib/websiteSync/config.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function urlLooksLikeLoggedOut(urlString) {
  const lower = String(urlString || '').toLowerCase();
  return (
    lower.includes('accounts.google.com') ||
    lower.includes('/login') ||
    lower.includes('/signin') ||
    lower.includes('/oauth')
  );
}

async function appearsLoggedIn(page, config) {
  const currentUrl = page.url();
  if (urlLooksLikeLoggedOut(currentUrl)) {
    return false;
  }

  const bodyText = await page
    .locator('body')
    .first()
    .innerText({ timeout: 1500 })
    .catch(() => '');

  const lowerBody = String(bodyText).toLowerCase();
  const hasBlockedPattern = config.loadingTextPatterns.some((pattern) =>
    lowerBody.includes(String(pattern).toLowerCase())
  );

  if (hasBlockedPattern) {
    return false;
  }

  const mainCount = await page.locator(config.extractSelector).count().catch(() => 0);
  return mainCount > 0;
}

async function waitUntilLoggedIn(page, config, timeoutMs = 300000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const ok = await appearsLoggedIn(page, config);
    if (ok) {
      return;
    }
    await sleep(1000);
  }

  throw new Error(
    `Timed out waiting for login after ${Math.floor(timeoutMs / 1000)}s. Re-run and complete login faster.`
  );
}

async function main() {
  const config = getWebsiteSyncConfig();
  const storageStatePath = resolveStorageStatePath(config);
  const loginUrl = new URL(config.loginStartPath, config.baseUrl).toString();

  const browser = await chromium.launch({
    headless: !config.headful,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`Opening: ${loginUrl}`);
    await page.goto(loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.renderTimeoutMs,
    });

    console.log('Complete Google login in the opened browser window, then return here.');
    console.log('Waiting for authenticated app view...');

    await waitUntilLoggedIn(page, config);

    fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
    await context.storageState({ path: storageStatePath });
    console.log(`Saved storage state to: ${storageStatePath}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Failed to record storage state:', error instanceof Error ? error.message : error);
  process.exit(1);
});
