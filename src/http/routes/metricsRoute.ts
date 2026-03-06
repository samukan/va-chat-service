import type { FastifyInstance } from 'fastify';

export async function registerMetricsRoute(app: FastifyInstance) {
  app.get('/metrics', async (request, reply) => {
    const requiredToken = app.config.metrics.token;
    if (requiredToken) {
      const headerToken = request.headers['x-metrics-token'];
      if (headerToken !== requiredToken) {
        reply.code(401).send({ message: 'Unauthorized metrics request' });
        return;
      }
    }

    reply.send(app.metrics.snapshot());
  });
}
