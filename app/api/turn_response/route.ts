import { getDeveloperPrompt, MODEL } from '@/config/constants';
import { getTools } from '@/lib/tools/tools';
import OpenAI from 'openai';

export async function POST(request: Request) {
  try {
    const { messages, toolsState } = await request.json();

    const tools = await getTools(toolsState);

    console.log('Tools:', tools);

    console.log('Received messages:', messages);

    const openai = new OpenAI();

    // If only File Search is enabled (and Web Search is off), nudge the model to use tools
    // to ground its answer in the knowledge base by requiring a tool call.
    // If File Search or Web Search is enabled, require tool usage to ground answers
    const preferGroundedAnswer = Boolean(
      toolsState?.fileSearchEnabled || toolsState?.webSearchEnabled
    );

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

    const events = await openai.responses.create({
      model: MODEL,
      input: messages,
      instructions,
      tools,
      // Encourage tool usage when data-first mode is implied
      tool_choice: preferGroundedAnswer ? 'required' : 'auto',
      stream: true,
      parallel_tool_calls: false,
    });

    // Create a ReadableStream that emits SSE data
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of events) {
            // Sending all events to the client
            const data = JSON.stringify({
              event: event.type,
              data: event,
            });
            controller.enqueue(`data: ${data}\n\n`);
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
