import { randomUUID } from 'node:crypto';
export function registerBaseHooks(app) {
    app.addHook('onRequest', async (request, reply) => {
        request.correlationId = request.headers['x-correlation-id']?.trim() || randomUUID();
        reply.header('x-correlation-id', request.correlationId);
        request.__startedAt = process.hrtime.bigint();
    });
    app.addHook('onResponse', async (request, reply) => {
        const startedAt = request.__startedAt;
        if (!startedAt) {
            return;
        }
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const routePath = request.routeOptions.url ?? request.url;
        app.metrics.record({
            method: request.method,
            route: routePath,
            statusCode: reply.statusCode,
            durationMs: elapsedMs
        });
        app.log.info({
            correlation_id: request.correlationId,
            method: request.method,
            route: routePath,
            status_code: reply.statusCode,
            latency_ms: Number(elapsedMs.toFixed(2))
        }, 'request completed');
    });
    app.setErrorHandler((error, request, reply) => {
        const known = error;
        const statusCode = Number.isInteger(known.statusCode) ? known.statusCode : 500;
        const code = known.code ?? 'INTERNAL_ERROR';
        const message = error instanceof Error ? error.message : 'Unhandled error';
        app.log.error({
            correlation_id: request.correlationId,
            err: error,
            code,
            status_code: statusCode
        }, 'request failed');
        if (reply.raw.headersSent) {
            reply.raw.end();
            return;
        }
        reply.code(statusCode).send({
            message: statusCode === 500 ? 'Internal server error' : message,
            code
        });
    });
}
export function registerJsonBodyParser(app) {
    app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: app.config.http.maxBodyBytes }, (request, body, done) => {
        const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
        request.rawBody = bodyBuffer;
        try {
            const parsed = bodyBuffer.length > 0 ? JSON.parse(bodyBuffer.toString('utf8')) : {};
            done(null, parsed);
        }
        catch {
            const parseError = new Error('Invalid JSON body');
            parseError.statusCode = 400;
            parseError.code = 'BAD_JSON';
            done(parseError);
        }
    });
}
