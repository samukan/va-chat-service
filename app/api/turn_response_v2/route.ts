import { validateTurnRequest } from '@/lib/gateway/validation';
import { buildSourcesSuffix, mapOpenAIEventToFrontendSse } from '@/lib/gateway/openaiEventMapper';
import OpenAI from 'openai';
import { z } from 'zod';

const encoder = new TextEncoder();

function toSseLine(payload: unknown): Uint8Array {
  if (typeof payload === 'string') {
    return encoder.encode(`data: ${payload}\n\n`);
  }

  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseVectorStoreIds(): string[] {
  const listFromPlural = process.env.RAG_VECTOR_STORE_IDS
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (listFromPlural && listFromPlural.length > 0) {
    return listFromPlural;
  }

  const single = process.env.RAG_VECTOR_STORE_ID?.trim();
  return single ? [single] : [];
}

export async function POST(request: Request): Promise<Response> {
  try {
    const rawBody = await request.json();
    const input = validateTurnRequest(rawBody);

    if (process.env.RAG_GATEWAY_MOCK === '1') {
      const mockStream = new ReadableStream({
        async start(controller) {
          controller.enqueue(
            toSseLine({
              event: 'response.output_text.delta',
              data: {delta: 'Mock '},
            }),
          );
          await sleep(200);

          controller.enqueue(
            toSseLine({
              event: 'response.output_text.delta',
              data: {delta: 'gateway '},
            }),
          );
          await sleep(200);

          controller.enqueue(
            toSseLine({
              event: 'response.output_text.delta',
              data: {delta: 'streaming'},
            }),
          );

          controller.enqueue(
            toSseLine({
              event: 'response.output_text.done',
              data: {},
            }),
          );

          controller.enqueue(toSseLine('[DONE]'));
          controller.close();
        },
      });

      return new Response(mockStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    const vectorStoreIds = parseVectorStoreIds();
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const tools =
      vectorStoreIds.length > 0
        ? [
            {
              type: 'file_search' as const,
              vector_store_ids: vectorStoreIds,
            },
          ]
        : [];

    const events = await openai.responses.create({
      model: process.env.RAG_MODEL?.trim() || process.env.MODEL?.trim() || 'gpt-4o',
      input: input.messages,
      stream: true,
      tools,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const collectedSources: any[] = [];
        try {
          for await (const event of events) {
            const mapped = mapOpenAIEventToFrontendSse(event);
            for (const source of mapped.sources) {
              collectedSources.push(source);
            }

            if (mapped.sse) {
              controller.enqueue(toSseLine(mapped.sse));
            }
          }

          const sourcesSuffix = buildSourcesSuffix(collectedSources);
          if (sourcesSuffix) {
            controller.enqueue(
              toSseLine({
                event: 'response.output_text.delta',
                data: {delta: sourcesSuffix},
              }),
            );
          }

          controller.enqueue(
            toSseLine({
              event: 'response.output_text.done',
              data: {},
            }),
          );

          controller.enqueue(toSseLine('[DONE]'));

          controller.close();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unexpected error';
          const isRateLimit =
            error !== null &&
            error !== undefined &&
            typeof error === 'object' &&
            'status' in error &&
            Number((error as {status?: number}).status) === 429;

          controller.enqueue(
            toSseLine({
              event: isRateLimit ? 'rate_limit_error' : 'error',
              data: {
                error: {message},
              },
            }),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    if (
      error !== null &&
      error !== undefined &&
      typeof error === 'object' &&
      'status' in error &&
      Number((error as {status?: number}).status) === 429
    ) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    }

    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request body',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
