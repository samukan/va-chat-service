export function buildLoggerOptions(config) {
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
