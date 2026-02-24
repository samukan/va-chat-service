export interface GatewayCitation {
  id: string;
  label: string;
  url?: string;
  fileName?: string;
}

export type GatewayStreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'citation'; citation: GatewayCitation }
  | { type: 'final'; text: string; citations: GatewayCitation[] }
  | { type: 'error'; message: string; code?: string };

export function toSseFrame(event: GatewayStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
