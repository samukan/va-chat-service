import type { FastifyInstance } from 'fastify';

export async function registerStubRoutes(app: FastifyInstance) {
  app.post('/v1/search', { preHandler: app.requireS2S }, async (_request, reply) => {
    reply.code(501).send({ message: 'Not implemented in Phase 1' });
  });

  app.post('/v1/ingest', { preHandler: app.requireS2S }, async (_request, reply) => {
    reply.code(501).send({ message: 'Not implemented in Phase 1' });
  });

  app.delete('/v1/docs/:doc_id', { preHandler: app.requireS2S }, async (_request, reply) => {
    reply.code(501).send({ message: 'Not implemented in Phase 1' });
  });
}
