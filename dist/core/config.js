import { z } from 'zod';
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3004),
    LOG_LEVEL: z.string().default('info'),
    OPENAI_BASE_URL: z.string().url().optional(),
    OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
    OPENAI_CHAT_MODEL: z.string().default('gpt-4.1-mini'),
    S2S_HMAC_SECRET: z.string().min(1, 'S2S_HMAC_SECRET is required'),
    S2S_MAX_SKEW_SEC: z.coerce.number().int().positive().default(60),
    NONCE_TTL_SEC: z.coerce.number().int().positive().default(300),
    HTTP_MAX_BODY_BYTES: z.coerce.number().int().positive().default(262144),
    RAG_ENABLED: z.enum(['0', '1']).default('0'),
    INJECT_CONTEXT_ENABLED: z.enum(['0', '1']).default('0'),
    METRICS_AUTH_TOKEN: z.string().optional(),
    APP_VERSION: z.string().default('phase1')
});
export function loadConfig() {
    const parsed = envSchema.parse(process.env);
    return {
        env: parsed.NODE_ENV,
        host: parsed.HOST,
        port: parsed.PORT,
        logLevel: parsed.LOG_LEVEL,
        openai: {
            baseUrl: parsed.OPENAI_BASE_URL,
            apiKey: parsed.OPENAI_API_KEY,
            model: parsed.OPENAI_CHAT_MODEL
        },
        s2s: {
            secret: parsed.S2S_HMAC_SECRET,
            maxSkewSec: parsed.S2S_MAX_SKEW_SEC,
            nonceTtlSec: parsed.NONCE_TTL_SEC
        },
        flags: {
            ragEnabled: parsed.RAG_ENABLED === '1',
            injectContextEnabled: parsed.INJECT_CONTEXT_ENABLED === '1'
        },
        http: {
            maxBodyBytes: parsed.HTTP_MAX_BODY_BYTES
        },
        metrics: {
            token: parsed.METRICS_AUTH_TOKEN
        },
        appVersion: parsed.APP_VERSION
    };
}
