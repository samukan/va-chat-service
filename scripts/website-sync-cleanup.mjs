import './_loadEnv.mjs';
import { runWebsiteSyncCleanup } from '../lib/websiteSync/cleanup.mjs';

runWebsiteSyncCleanup().catch((error) => {
  console.error('website:sync:cleanup failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
