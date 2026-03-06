import { z } from 'zod';
const messageSchema = z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().min(1).max(8000)
});
export const chatRequestSchema = z.object({
    messages: z.array(messageSchema).min(1).max(50),
    options: z.object({
        temperature: z.number().min(0).max(2).optional(),
        max_output_tokens: z.number().int().positive().max(4096).optional()
    }).optional()
});
