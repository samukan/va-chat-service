import { buildApp } from '../app.js';
async function main() {
    const app = await buildApp();
    try {
        await app.listen({
            host: app.config.host,
            port: app.config.port
        });
        app.log.info({
            host: app.config.host,
            port: app.config.port,
            flags: app.config.flags
        }, 'va-chat-service phase1 running');
    }
    catch (error) {
        app.log.error({ err: error }, 'failed to start server');
        process.exit(1);
    }
}
void main();
