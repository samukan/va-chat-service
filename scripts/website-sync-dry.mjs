import './_loadEnv.mjs';
import { runWebsiteSyncDry } from '../lib/websiteSync/dryRun.mjs';

runWebsiteSyncDry().catch((error) => {
  console.error('website:sync:dry failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
