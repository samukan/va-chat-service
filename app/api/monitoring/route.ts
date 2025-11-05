import { getInteractionStats, getAllInteractions } from '@/lib/rate-limit';
import { NextRequest } from 'next/server';

/**
 * Monitoring endpoint for admin/development use
 * Returns statistics and recent interactions
 *
 * Usage: GET /api/monitoring?key=your-secret-key
 *
 * TODO: Add proper authentication before deploying to production
 */
export async function GET(request: NextRequest) {
  // Simple authentication - replace with proper auth in production
  const searchParams = request.nextUrl.searchParams;
  const key = searchParams.get('key');
  const expectedKey =
    process.env.MONITORING_KEY || 'dev-key-change-in-production';

  if (key !== expectedKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const stats = getInteractionStats();
    const recentInteractions = getAllInteractions(20); // Last 20 interactions

    return new Response(
      JSON.stringify({
        stats,
        recentInteractions: recentInteractions.map((interaction) => ({
          ...interaction,
          // Truncate long messages for overview
          userMessage: interaction.userMessage.substring(0, 200),
          assistantResponse: interaction.assistantResponse.substring(0, 200),
        })),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      }
    );
  } catch (error) {
    console.error('Error getting monitoring data:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500 }
    );
  }
}
