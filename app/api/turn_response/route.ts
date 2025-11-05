import { getDeveloperPrompt, MODEL } from '@/config/constants';
import { getTools } from '@/lib/tools/tools';
import { validateAnswer, extractCitations } from '@/lib/validation';
import {
  checkRateLimit,
  getClientIdentifier,
  logInteraction,
} from '@/lib/rate-limit';
import OpenAI from 'openai';

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Rate limiting check
    const clientId = getClientIdentifier(request);
    const rateLimitCheck = checkRateLimit(clientId);

    if (!rateLimitCheck.allowed) {
      const resetIn = Math.ceil((rateLimitCheck.resetAt - Date.now()) / 1000);
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          message: `Liikaa pyyntöjä. Yritä uudelleen ${resetIn} sekunnin kuluttua.`,
          resetAt: rateLimitCheck.resetAt,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': rateLimitCheck.remaining.toString(),
            'X-RateLimit-Reset': rateLimitCheck.resetAt.toString(),
          },
        }
      );
    }

    const { messages, toolsState } = await request.json();

    // Force file search to always be enabled for accuracy
    const enhancedToolsState = {
      ...toolsState,
      fileSearchEnabled: true, // Always on for student exchange Q&A
    };

    const tools = await getTools(enhancedToolsState);

    console.log('Tools:', tools);

    console.log('Received messages:', messages);

    const openai = new OpenAI();

    // Build dynamic instructions that include domain allowlist for web search
    let instructions = getDeveloperPrompt();
    const allowedDomains: string[] = Array.isArray(
      toolsState?.webSearchConfig?.allowed_domains
    )
      ? (toolsState.webSearchConfig.allowed_domains as string[])
          .map((d) => d.trim())
          .filter((d) => d)
      : [];

    if (toolsState?.webSearchEnabled && allowedDomains.length > 0) {
      const domainsBullet = allowedDomains.map((d) => `- ${d}`).join('\n');
      instructions += `\n\nWeb search constraints:\n- Restrict any web searches strictly to the following domains (and their exact subpaths only).\n- Prefer results from these domains exclusively; do not cite or use other sites.\n- Use site: filters when searching (e.g., site:example.com).\nAllowed domains:\n${domainsBullet}`;
    }

    // Require explicit source listing at the end of the answer for transparency
    instructions += `\n\nCitations policy:\n- Always include a final section titled "Lähteet:" listing every source you used.\n- For file-based sources list the file names. For web sources list the full URLs and titles.\n- Do not answer without citing sources.`;

    // Track tool calls and response for validation
    let fullResponse = '';
    const toolCallsUsed: any[] = [];
    let lastUserMessage = '';

    // Get last user message for logging
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
      lastUserMessage =
        typeof lastMessage.content === 'string'
          ? lastMessage.content
          : JSON.stringify(lastMessage.content);
    }

    const events = await openai.responses.create({
      model: MODEL,
      input: messages,
      instructions,
      tools,
      // Always require tool usage for grounded answers
      tool_choice: 'required',
      stream: true,
      parallel_tool_calls: false,
    });

    // Create a ReadableStream that emits SSE data
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of events) {
            // Track response content and tool calls for validation (using any to avoid type issues)
            const eventAny = event as any;

            // Collect response text
            if (eventAny.delta && typeof eventAny.delta === 'string') {
              fullResponse += eventAny.delta;
            } else if (eventAny.text) {
              fullResponse += eventAny.text;
            }

            // Track tool usage
            if (eventAny.type && eventAny.type.includes('_call')) {
              toolCallsUsed.push(event);
            }

            // Sending all events to the client
            const data = JSON.stringify({
              event: event.type,
              data: event,
            });
            controller.enqueue(`data: ${data}\n\n`);
          }

          // Validate response after streaming completes
          const validation = validateAnswer(fullResponse, toolCallsUsed);
          const citations = extractCitations(fullResponse);
          const responseTime = Date.now() - startTime;

          // Log interaction for monitoring
          logInteraction({
            userMessage: lastUserMessage,
            assistantResponse: fullResponse,
            citations,
            confidence: validation.confidence,
            warnings: validation.warnings,
            responseTime,
            ip: clientId,
          });

          // Send validation metadata to client
          if (validation.warnings.length > 0) {
            const validationData = JSON.stringify({
              event: 'validation.warning',
              data: {
                confidence: validation.confidence,
                warnings: validation.warnings,
              },
            });
            controller.enqueue(`data: ${validationData}\n\n`);
          }

          // If confidence is low, add a disclaimer
          if (validation.confidence === 'low') {
            const disclaimerData = JSON.stringify({
              event: 'response.disclaimer',
              data: {
                message:
                  '⚠️ Huomio: Vastauksessa ei ehkä ole käytetty tietokantaa tai siinä on epävarmuustekijöitä. Varmista tieto koordinaattorilta.',
              },
            });
            controller.enqueue(`data: ${disclaimerData}\n\n`);
          }

          // End of stream
          controller.close();
        } catch (error) {
          console.error('Error in streaming loop:', error);
          controller.error(error);
        }
      },
    });

    // Return the ReadableStream as SSE
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-RateLimit-Remaining': rateLimitCheck.remaining.toString(),
        'X-RateLimit-Reset': rateLimitCheck.resetAt.toString(),
      },
    });
  } catch (error) {
    console.error('Error in POST handler:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500 }
    );
  }
}
