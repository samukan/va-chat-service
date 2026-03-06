import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { HttpError } from '../core/errors.js';
const userContextSchema = z.object({
    user_id: z.string().min(1),
    tenant_id: z.string().min(1),
    roles: z.array(z.string()).default([])
});
export function parseUserContext(encoded) {
    if (!encoded) {
        throw new HttpError(401, 'MISSING_USER_CONTEXT', 'Missing x-user-context header');
    }
    try {
        const decoded = Buffer.from(encoded, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        return userContextSchema.parse(parsed);
    }
    catch {
        throw new HttpError(403, 'INVALID_USER_CONTEXT', 'Invalid x-user-context header');
    }
}
