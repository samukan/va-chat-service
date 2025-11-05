/**
 * Rate limiting and monitoring utilities
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface InteractionLog {
  timestamp: Date;
  userMessage: string;
  assistantResponse: string;
  citations: string[];
  confidence: string;
  warnings: string[];
  responseTime: number;
  ip?: string;
}

// In-memory store (use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();
const interactionLogs: InteractionLog[] = [];

// Rate limit configuration
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 requests per minute

/**
 * Check if a request should be rate limited
 */
export function checkRateLimit(identifier: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // Clean up expired entries
  if (entry && entry.resetAt < now) {
    rateLimitStore.delete(identifier);
  }

  const current = rateLimitStore.get(identifier);

  if (!current) {
    // First request in this window
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW,
    });
    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_WINDOW - 1,
      resetAt: now + RATE_LIMIT_WINDOW,
    };
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
    };
  }

  // Increment count
  current.count += 1;
  rateLimitStore.set(identifier, current);

  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - current.count,
    resetAt: current.resetAt,
  };
}

/**
 * Get client identifier from request (IP or session)
 */
export function getClientIdentifier(request: Request): string {
  // Try to get real IP from headers (for proxies/load balancers)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  // Fallback to a session-based identifier if available
  // In production, consider using session tokens
  return 'default-client';
}

/**
 * Log an interaction for monitoring and quality assurance
 */
export function logInteraction(log: Omit<InteractionLog, 'timestamp'>): void {
  interactionLogs.push({
    ...log,
    timestamp: new Date(),
  });

  // Keep only last 1000 interactions in memory
  if (interactionLogs.length > 1000) {
    interactionLogs.shift();
  }

  // In production, also send to a proper logging service or database
  if (log.warnings.length > 0 || log.confidence === 'low') {
    console.warn('⚠️ Low confidence response:', {
      question: log.userMessage.substring(0, 100),
      confidence: log.confidence,
      warnings: log.warnings,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Get interaction statistics for monitoring
 */
export function getInteractionStats() {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const recentLogs = interactionLogs.filter(
    (log) => log.timestamp > oneHourAgo
  );
  const dailyLogs = interactionLogs.filter(
    (log) => log.timestamp > last24Hours
  );

  const lowConfidenceCount = recentLogs.filter(
    (log) => log.confidence === 'low'
  ).length;

  const averageResponseTime =
    recentLogs.reduce((sum, log) => sum + log.responseTime, 0) /
    (recentLogs.length || 1);

  return {
    lastHour: {
      total: recentLogs.length,
      lowConfidence: lowConfidenceCount,
      averageResponseTime: Math.round(averageResponseTime),
    },
    last24Hours: {
      total: dailyLogs.length,
    },
    recentWarnings: recentLogs
      .filter((log) => log.warnings.length > 0)
      .slice(-10)
      .map((log) => ({
        question: log.userMessage.substring(0, 100),
        warnings: log.warnings,
        timestamp: log.timestamp,
      })),
  };
}

/**
 * Get all interactions (for admin review)
 */
export function getAllInteractions(limit = 100): InteractionLog[] {
  return interactionLogs.slice(-limit).reverse();
}
