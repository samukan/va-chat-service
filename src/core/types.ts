export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequestBody {
  messages: ChatMessage[];
  options?: {
    temperature?: number;
    max_output_tokens?: number;
    top_k?: number;
  };
}

export interface UserContext {
  user_id: string;
  tenant_id: string;
  roles: string[];
}

export interface RequestMetricsRecord {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

export interface OpenAIDepHealth {
  ok: boolean;
  message?: string;
}
