import type { FastifyInstance } from 'fastify';
import { chatRequestSchema } from '../schemas/chatSchema.js';
import { HttpError } from '../../core/errors.js';
import type { ChatMessage } from '../../core/types.js';
import type { RetrievedChunk } from '../../retrieval/milvusRetrievalClient.js';

function writeSseEvent(reply: any, event: string, payload: unknown): void {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function latestUserMessage(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'user') {
      return message.content;
    }
  }

  return null;
}

function buildContext(chunks: RetrievedChunk[]): string {
  if (!chunks.length) {
    return 'Tietokannasta ei loytynyt relevanttia tietoa kysymykseen.';
  }

  return chunks
    .map((chunk, index) => {
      return [
        `[Lahde ${index + 1}]`,
        `doc_id: ${chunk.doc_id}`,
        `source: ${chunk.source ?? 'unknown'}`,
        `content: ${chunk.text}`,
      ].join('\n');
    })
    .join('\n\n');
}

function buildRagMessages(messages: ChatMessage[], chunks: RetrievedChunk[]): ChatMessage[] {
  const systemPrefix: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Vastaa kysymykseen vain annetun kontekstin perusteella. Jos konteksti ei riita, sano se lyhyesti.' +
        ' Pida vastaus tiiviina ja asiallisena.',
    },
    {
      role: 'system',
      content: `Konteksti:\n${buildContext(chunks)}`,
    },
  ];

  return [...systemPrefix, ...messages];
}

function buildCitationToken(chunks: RetrievedChunk[]): string | null {
  const sources = Array.from(
    new Set(
      chunks
        .map((chunk) => (typeof chunk.source === 'string' ? chunk.source.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  );

  if (!sources.length) {
    return null;
  }

  return `\n\nLahteet:\n${sources.map((source) => `- ${source}`).join('\n')}`;
}

export async function registerChatRoute(app: FastifyInstance) {
  app.post('/v1/chat', { preHandler: app.requireS2S }, async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(400, 'BAD_REQUEST', 'Invalid request body');
    }

    const { messages, options } = parsed.data;
    const tenantId = request.userContext?.tenant_id;
    if (!tenantId) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Missing tenant context');
    }

    const userQuery = latestUserMessage(messages);
    if (!userQuery) {
      throw new HttpError(400, 'BAD_REQUEST', 'At least one user message is required');
    }

    app.log.info(
      {
        correlation_id: request.correlationId,
        user_id: request.userContext?.user_id,
        tenant_id: tenantId,
        roles: request.userContext?.roles ?? [],
        top_k: options?.top_k ?? app.config.milvus.topK,
      },
      'chat request accepted',
    );

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('x-correlation-id', request.correlationId);
    reply.raw.flushHeaders?.();

    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    request.raw.on('close', onClose);

    try {
      let retrievedChunks: RetrievedChunk[];

      try {
        retrievedChunks = await app.retrievalClient.search({
          query: userQuery,
          tenantId,
          topK: options?.top_k,
          correlationId: request.correlationId,
          signal: abortController.signal,
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        app.log.error(
          {
            correlation_id: request.correlationId,
            tenant_id: tenantId,
            err: error,
          },
          'retrieval failed',
        );
        writeSseEvent(reply, 'error', {
          message: 'RAG retrieval unavailable',
          code: 'RAG_UNAVAILABLE',
        });
        reply.raw.end();
        return;
      }

      const ragMessages = buildRagMessages(messages, retrievedChunks);

      for await (const token of app.chatGateway.streamText({
        messages: ragMessages,
        temperature: options?.temperature,
        maxOutputTokens: options?.max_output_tokens,
        signal: abortController.signal,
      })) {
        writeSseEvent(reply, 'token', { t: token });
      }

      const citationToken = buildCitationToken(retrievedChunks);
      if (citationToken) {
        writeSseEvent(reply, 'token', { t: citationToken });
      }

      writeSseEvent(reply, 'done', { ok: true });
      reply.raw.end();
    } catch (error) {
      if (abortController.signal.aborted) {
        app.log.info({ correlation_id: request.correlationId }, 'Client disconnected during stream');
        return;
      }

      const message = error instanceof Error ? error.message : 'Unexpected chat streaming error';
      writeSseEvent(reply, 'error', { message, code: 'CHAT_STREAM_FAILED' });
      reply.raw.end();
    } finally {
      request.raw.off('close', onClose);
    }
  });
}
