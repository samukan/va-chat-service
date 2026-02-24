import { z } from 'zod';

const CHAT_ROLE = z.enum(['user', 'assistant', 'system']);

const messageSchema = z.object({
  role: CHAT_ROLE,
  content: z.string().min(1).max(8000),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
  conversationId: z.string().min(1).max(120).optional(),
}).strict();

export type GatewayTurnRequest = z.infer<typeof requestSchema>;

export function validateTurnRequest(input: unknown): GatewayTurnRequest {
  return requestSchema.parse(input);
}
