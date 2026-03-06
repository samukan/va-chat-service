import OpenAI from 'openai';
import type { AppConfig } from '../core/config.js';
import type { ChatMessage } from '../core/types.js';

export interface ChatRunInput {
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface ChatGateway {
  streamText(input: ChatRunInput): AsyncIterable<string>;
  checkDependency(): Promise<{ ok: boolean; message?: string }>;
}

export class OpenAIChatGateway implements ChatGateway {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: AppConfig) {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseUrl
    });
    this.model = config.openai.model;
  }

  async *streamText(input: ChatRunInput): AsyncIterable<string> {
    const events = await this.client.responses.create({
      model: this.model,
      input: input.messages,
      temperature: input.temperature,
      max_output_tokens: input.maxOutputTokens,
      stream: true
    });

    for await (const event of events) {
      if (input.signal?.aborted) {
        break;
      }

      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        yield event.delta;
      }
    }
  }

  async checkDependency(): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.client.models.list();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'OpenAI dependency check failed'
      };
    }
  }
}
