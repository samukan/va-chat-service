import { GatewayPolicy } from '@/lib/gateway/policy';
import {
  GatewayCitation,
  GatewayStreamEvent,
} from '@/lib/gateway/streamNormalizer';
import { GatewayTurnRequest } from '@/lib/gateway/validation';

export interface RunTurnContext {
  requestId: string;
  startedAt: number;
  policy: GatewayPolicy;
}

export interface RunTurnHandlers {
  onEvent: (event: GatewayStreamEvent) => void;
}

export async function runTurn(
  input: GatewayTurnRequest,
  context: RunTurnContext,
  handlers: RunTurnHandlers
): Promise<{ text: string; citations: GatewayCitation[] }> {
  const elapsedMs = Date.now() - context.startedAt;

  handlers.onEvent({
    type: 'error',
    code: 'NOT_IMPLEMENTED',
    message: 'turn_response_v2 runner is scaffolded but not yet connected.',
  });

  const text = `Request received. Model ${context.policy.model} is configured. Elapsed ${elapsedMs}ms.`;
  const citations: GatewayCitation[] = [];

  handlers.onEvent({
    type: 'final',
    text,
    citations,
  });

  return { text, citations };
}
