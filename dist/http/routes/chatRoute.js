import { chatRequestSchema } from '../schemas/chatSchema.js';
import { HttpError } from '../../core/errors.js';
function writeSseEvent(reply, event, payload) {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}
export async function registerChatRoute(app) {
    app.post('/v1/chat', { preHandler: app.requireS2S }, async (request, reply) => {
        const parsed = chatRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            throw new HttpError(400, 'BAD_REQUEST', 'Invalid request body');
        }
        const { messages, options } = parsed.data;
        app.log.info({
            correlation_id: request.correlationId,
            user_id: request.userContext?.user_id,
            tenant_id: request.userContext?.tenant_id,
            roles: request.userContext?.roles ?? [],
            rag_enabled: app.config.flags.ragEnabled,
            inject_context_enabled: app.config.flags.injectContextEnabled
        }, 'chat request accepted');
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('x-correlation-id', request.correlationId);
        reply.raw.flushHeaders?.();
        const abortController = new AbortController();
        const onClose = () => abortController.abort();
        request.raw.on('close', onClose);
        try {
            if (app.config.flags.ragEnabled) {
                app.log.info({
                    correlation_id: request.correlationId,
                    feature: 'rag',
                    enabled: true
                }, 'RAG feature flag enabled but Phase 1 runs plain chat mode');
            }
            for await (const token of app.chatGateway.streamText({
                messages,
                temperature: options?.temperature,
                maxOutputTokens: options?.max_output_tokens,
                signal: abortController.signal
            })) {
                writeSseEvent(reply, 'token', { t: token });
            }
            writeSseEvent(reply, 'done', { ok: true });
            reply.raw.end();
        }
        catch (error) {
            if (abortController.signal.aborted) {
                app.log.info({ correlation_id: request.correlationId }, 'Client disconnected during stream');
                return;
            }
            const message = error instanceof Error ? error.message : 'Unexpected chat streaming error';
            writeSseEvent(reply, 'error', { message, code: 'CHAT_STREAM_FAILED' });
            reply.raw.end();
        }
        finally {
            request.raw.off('close', onClose);
        }
    });
}
