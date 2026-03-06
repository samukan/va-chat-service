import OpenAI from 'openai';
export class OpenAIChatGateway {
    client;
    model;
    constructor(config) {
        this.client = new OpenAI({
            apiKey: config.openai.apiKey,
            baseURL: config.openai.baseUrl
        });
        this.model = config.openai.model;
    }
    async *streamText(input) {
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
    async checkDependency() {
        try {
            await this.client.models.list();
            return { ok: true };
        }
        catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : 'OpenAI dependency check failed'
            };
        }
    }
}
