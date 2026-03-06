import type { AppConfig } from './config.js';

export function buildLoggerOptions(config: AppConfig) {
  return {
    level: config.logLevel,
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    base: {
      service: 'va-chat-service',
      env: config.env,
      version: config.appVersion
    }
  };
}
