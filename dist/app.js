import fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './core/config.js';
import { buildLoggerOptions } from './core/logger.js';
import { InMemoryMetrics } from './telemetry/metrics.js';
import { OpenAIChatGateway } from './llm/openaiChatGateway.js';
import { MilvusRetrievalClient } from './retrieval/milvusRetrievalClient.js';
import { registerBaseHooks, registerJsonBodyParser } from './bootstrap/plugins.js';
import { registerChatRoute } from './http/routes/chatRoute.js';
import { registerHealthRoute } from './http/routes/healthRoute.js';
import { registerMetricsRoute } from './http/routes/metricsRoute.js';
import { registerStubRoutes } from './http/routes/stubRoutes.js';
import { createS2SGuard } from './security/s2sGuard.js';
export async function buildApp(overrides = {}) {
    const config = loadConfig();
    const loggerOptions = buildLoggerOptions(config);
    const app = fastify({
        logger: loggerOptions,
        bodyLimit: config.http.maxBodyBytes,
        genReqId: () => randomUUID()
    });
    app.decorate('config', config);
    app.decorate('metrics', new InMemoryMetrics());
    app.decorate('chatGateway', overrides.chatGateway ?? new OpenAIChatGateway(config));
    app.decorate('retrievalClient', overrides.retrievalClient ?? new MilvusRetrievalClient(config));
    app.decorate('requireS2S', createS2SGuard(config));
    registerJsonBodyParser(app);
    registerBaseHooks(app);
    await registerHealthRoute(app);
    await registerMetricsRoute(app);
    await registerChatRoute(app);
    await registerStubRoutes(app);
    return app;
}
