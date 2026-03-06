import { createHash, createHmac, randomBytes } from 'node:crypto';

export function buildSignedHeaders(input: {
  method: string;
  path: string;
  body: unknown;
  secret: string;
  userContext: { user_id: string; tenant_id: string; roles: string[] };
  correlationId?: string;
}) {
  const payload = JSON.stringify(input.body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(12).toString('hex');
  const bodyHash = createHash('sha256').update(payload).digest('hex');
  const baseString = `${input.method.toUpperCase()}\n${input.path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signatureHex = createHmac('sha256', input.secret).update(baseString).digest('hex');

  return {
    'content-type': 'application/json',
    'x-s2s-timestamp': timestamp,
    'x-s2s-nonce': nonce,
    'x-s2s-signature': signatureHex,
    'x-user-context': Buffer.from(JSON.stringify(input.userContext), 'utf8').toString('base64'),
    'x-correlation-id': input.correlationId ?? randomBytes(8).toString('hex')
  };
}
