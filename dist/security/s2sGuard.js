import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../core/errors.js';
import { NonceStore } from './nonceStore.js';
import { parseUserContext } from './userContext.js';
function toStringHeader(value) {
    if (typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value) && value.length > 0) {
        return value[0];
    }
    return undefined;
}
function parseSignature(input) {
    const trimmed = input.trim();
    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
        return Buffer.from(trimmed, 'hex');
    }
    return Buffer.from(trimmed, 'base64');
}
function bodySha256(rawBody) {
    const digest = createHash('sha256');
    digest.update(rawBody ?? Buffer.from(''));
    return digest.digest('hex');
}
function buildBaseString(request, timestamp, nonce) {
    const rawPath = request.raw.url ? new URL(request.raw.url, 'http://localhost').pathname : request.url;
    const hash = bodySha256(request.rawBody);
    return `${request.method.toUpperCase()}\n${rawPath}\n${timestamp}\n${nonce}\n${hash}`;
}
function isTimestampFresh(timestampSec, skewSec) {
    const now = Math.floor(Date.now() / 1000);
    return Math.abs(now - timestampSec) <= skewSec;
}
export function createS2SGuard(config) {
    const nonceStore = new NonceStore(config.s2s.nonceTtlSec);
    return async function verify(request) {
        const timestampHeader = toStringHeader(request.headers['x-s2s-timestamp']);
        const nonce = toStringHeader(request.headers['x-s2s-nonce']);
        const signatureHeader = toStringHeader(request.headers['x-s2s-signature']);
        const correlationId = toStringHeader(request.headers['x-correlation-id']);
        if (!timestampHeader || !nonce || !signatureHeader) {
            throw new HttpError(401, 'S2S_HEADERS_MISSING', 'Missing required S2S headers');
        }
        const timestampSec = Number.parseInt(timestampHeader, 10);
        if (!Number.isFinite(timestampSec)) {
            throw new HttpError(403, 'S2S_TIMESTAMP_INVALID', 'Invalid x-s2s-timestamp header');
        }
        if (!isTimestampFresh(timestampSec, config.s2s.maxSkewSec)) {
            throw new HttpError(403, 'S2S_TIMESTAMP_SKEW', 'Timestamp outside allowed skew');
        }
        if (nonceStore.has(nonce)) {
            throw new HttpError(403, 'S2S_NONCE_REPLAY', 'Nonce already used');
        }
        const baseString = buildBaseString(request, timestampHeader, nonce);
        const expected = createHmac('sha256', config.s2s.secret).update(baseString).digest();
        const provided = parseSignature(signatureHeader);
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
            throw new HttpError(403, 'S2S_SIGNATURE_INVALID', 'Invalid signature');
        }
        nonceStore.add(nonce);
        request.userContext = parseUserContext(toStringHeader(request.headers['x-user-context']));
        request.correlationId = correlationId && correlationId.length > 0 ? correlationId : randomUUID();
    };
}
