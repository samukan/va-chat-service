import type { UserContext } from '../core/types.js';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
    userContext?: UserContext;
    rawBody?: Buffer;
  }
}
