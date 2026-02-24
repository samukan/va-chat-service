export interface GatewayPolicy {
  model: string;
  temperature: number;
  vectorStoreId?: string;
  fileSearchEnabled: boolean;
  allowedWebDomains: string[];
}

function parseDomains(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean);
}

export function loadGatewayPolicy(): GatewayPolicy {
  const model = process.env.RAG_MODEL?.trim() || process.env.MODEL?.trim() || 'gpt-4o';
  const temperatureRaw = process.env.RAG_TEMPERATURE?.trim();
  const parsedTemperature = temperatureRaw ? Number(temperatureRaw) : 0.2;
  const temperature = Number.isFinite(parsedTemperature) ? parsedTemperature : 0.2;

  const vectorStoreId = process.env.RAG_VECTOR_STORE_ID?.trim();

  return {
    model,
    temperature,
    vectorStoreId,
    fileSearchEnabled: Boolean(vectorStoreId),
    allowedWebDomains: parseDomains(process.env.RAG_ALLOWED_WEB_DOMAINS),
  };
}
