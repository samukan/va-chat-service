# Student Exchange Q&A Enhancements

This document describes the accuracy and monitoring features implemented for the student exchange chatbot.

## Features Implemented

### 1. **File Search Always Enabled**

- File search (vector store) is now **locked to always be ON**
- Users cannot disable it, ensuring all answers are grounded in the knowledge base
- Located in: `stores/useToolsStore.ts`

### 2. **Enhanced System Instructions**

- New student exchange-specific prompt focused on accuracy
- Requires citations for all answers
- Instructs AI to admit when information isn't available
- Prohibits guessing or using general knowledge
- Located in: `config/constants.ts`

Key rules:

- Must use File Search for every question
- Must cite sources in a "Lähteet:" section
- Must say "En löydä tähän vastausta..." when information isn't available
- Cannot make assumptions or extrapolate

### 3. **Answer Quality Validation**

- Validates every response after generation
- Checks for:
  - File search tool usage
  - Citation presence
  - Uncertainty phrases
  - Response completeness
- Assigns confidence levels: high, medium, low
- Located in: `lib/validation.ts`

### 4. **Low Confidence Fallback Handler**

- Automatically detects low-confidence responses
- Sends disclaimer to UI when confidence is low
- Warning message: "⚠️ Huomio: Vastauksessa ei ehkä ole käytetty tietokantaa..."
- Located in: `app/api/turn_response/route.ts`

### 5. **Rate Limiting**

- Prevents abuse: 10 requests per minute per client
- Returns 429 status when limit exceeded
- Includes reset time in response
- Located in: `lib/rate-limit.ts`

Configuration:

```typescript
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 requests per minute
```

### 6. **Comprehensive Monitoring**

- Logs all interactions with metadata
- Tracks:
  - Questions and answers
  - Citations used
  - Confidence levels
  - Response times
  - Warnings
- Provides statistics endpoint
- Located in: `lib/rate-limit.ts`

## Usage

### Accessing Monitoring Data

The monitoring endpoint provides real-time statistics:

```bash
GET /api/monitoring?key=your-secret-key
```

Response includes:

- Total interactions (last hour and 24 hours)
- Average response time
- Low confidence count
- Recent warnings
- Last 20 interactions

**Set the monitoring key** in `.env`:

```
MONITORING_KEY=your-secure-random-key
```

### Example Response

```json
{
  "stats": {
    "lastHour": {
      "total": 45,
      "lowConfidence": 3,
      "averageResponseTime": 1234
    },
    "last24Hours": {
      "total": 312
    },
    "recentWarnings": [
      {
        "question": "Mikä on vaihdon hinta?",
        "warnings": ["No citations section found"],
        "timestamp": "2025-11-05T10:30:00.000Z"
      }
    ]
  },
  "recentInteractions": [...]
}
```

## Validation Results

The system tracks three confidence levels:

### High Confidence ✅

- File search was used
- Citations present
- No uncertainty phrases
- Complete answer

### Medium Confidence ⚠️

- Missing citations OR
- Contains uncertainty phrases OR
- Unusually short response

### Low Confidence ❌

- No file search used
- Generic response without sources
- Multiple validation failures

## Production Recommendations

### 1. Database Logging

Replace in-memory logging with a proper database:

```typescript
// In lib/rate-limit.ts
export async function logInteraction(log: InteractionLog) {
  await db.interactions.create({
    data: log,
  });
}
```

### 2. Authentication

Add proper authentication to the monitoring endpoint:

```typescript
// Use JWT or session-based auth
const session = await getServerSession(request);
if (!session?.user?.isAdmin) {
  return 401;
}
```

### 3. Rate Limit Storage

Use Redis for distributed rate limiting:

```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN,
});
```

### 4. Alerting

Set up alerts for low-confidence responses:

```typescript
if (validation.confidence === 'low') {
  await sendSlackAlert({
    message: `Low confidence response detected`,
    question: userMessage,
    warnings: validation.warnings,
  });
}
```

### 5. Analytics Dashboard

Build a dashboard to visualize:

- Response time trends
- Confidence distribution
- Most asked questions
- Common warnings
- Peak usage times

## Testing

### Test Rate Limiting

```bash
# Send 11 requests quickly
for i in {1..11}; do
  curl -X POST http://localhost:3000/api/turn_response \
    -H "Content-Type: application/json" \
    -d '{"messages": [{"role":"user","content":"Test"}], "toolsState": {}}'
done
```

### Test Monitoring

```bash
curl http://localhost:3000/api/monitoring?key=dev-key-change-in-production
```

### Test Low Confidence Detection

Ask a question that cannot be answered from the knowledge base and verify the disclaimer appears.

## Maintenance

### Regular Tasks

1. **Review low-confidence interactions** weekly
2. **Update knowledge base** based on unanswered questions
3. **Monitor response times** for performance issues
4. **Check rate limit** effectiveness

### Knowledge Base Updates

When adding new documents:

1. Upload to vector store
2. Test with sample questions
3. Verify citations appear correctly
4. Update system prompt if needed

## Troubleshooting

### File Search Not Working

- Verify vector store ID is set in `config/constants.ts`
- Check vector store has documents
- Ensure API key has access to vector store

### Rate Limit Too Restrictive

Adjust in `lib/rate-limit.ts`:

```typescript
const MAX_REQUESTS_PER_WINDOW = 20; // Increase limit
```

### Missing Citations

Check the system prompt requires "Lähteet:" section and verify the vector store contains the documents.

## Environment Variables

Add to `.env`:

```
OPENAI_API_KEY=your-openai-api-key
MONITORING_KEY=your-secure-random-key
```

## Files Modified

- ✅ `stores/useToolsStore.ts` - Locked file search to always on
- ✅ `config/constants.ts` - Enhanced system prompt
- ✅ `app/api/turn_response/route.ts` - Added validation and rate limiting
- ✅ `lib/validation.ts` - New validation utilities
- ✅ `lib/rate-limit.ts` - Rate limiting and monitoring
- ✅ `app/api/monitoring/route.ts` - Monitoring endpoint

## Next Steps

1. Set up vector store with student exchange documents
2. Configure monitoring key
3. Test with real questions
4. Review initial interactions for accuracy
5. Adjust rate limits based on usage
6. Set up production logging infrastructure
