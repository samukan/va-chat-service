import type { FastifyInstance } from 'fastify';

export async function registerHealthRoute(app: FastifyInstance) {
  app.get('/health', async (_request, reply) => {
    const openai = await app.chatGateway.checkDependency();

    reply.code(openai.ok ? 200 : 503).send({
      status: openai.ok ? 'ok' : 'degraded',
      deps: {
        openai
      },
      version: app.config.appVersion,
      uptime_sec: Math.floor(process.uptime())
    });
  });
}
