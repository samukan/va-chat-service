import './_loadEnv.mjs';
import { runWebsiteSyncUpload } from '../lib/websiteSync/sync.mjs';

runWebsiteSyncUpload().catch((error) => {
  console.error('website:sync failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
