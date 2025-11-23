/**
 * Answer validation utilities for ensuring quality and accuracy
 */

export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Validates an AI-generated answer for quality and accuracy
 */
export function validateAnswer(
  answer: string,
  toolCalls: any[] = []
): ValidationResult {
  const warnings: string[] = [];
  let confidence: 'high' | 'medium' | 'low' = 'high';

  const lowerAnswer = answer.toLowerCase();
  const greetingPhrases = [
    'hei',
    'moi',
    'terve',
    'huomenta',
    'päivää',
    'iltaa',
    'hello',
    'hi',
  ];
  // Simple heuristic: short answer containing a greeting word
  const isGreeting =
    answer.trim().length < 150 &&
    greetingPhrases.some((g) => lowerAnswer.includes(g));

  if (isGreeting) {
    // For greetings, we don't expect file search or citations
    return { isValid: true, warnings: [], confidence: 'high' };
  }

  // Check if file search or web search was used
  const searchToolUsed = toolCalls.some((call) => {
    // Handle standard tool calls
    if (
      call.type === 'file_search' ||
      call.function?.name === 'file_search' ||
      call.type === 'web_search' ||
      call.function?.name === 'web_search'
    ) {
      return true;
    }

    // Handle streaming events (e.g. response.file_search_call.completed)
    if (typeof call.type === 'string') {
      return (
        call.type.includes('file_search') || call.type.includes('web_search')
      );
    }

    return false;
  });

  if (!searchToolUsed) {
    warnings.push(
      'No search tool was used - answer may not be grounded in knowledge base'
    );
    confidence = 'low';
  }

  // Check for citations
  const hasCitations =
    answer.includes('Lähteet:') || answer.includes('Sources:');
  if (!hasCitations) {
    warnings.push('No citations section found in response');
    confidence = confidence === 'high' ? 'medium' : 'low';
  }

  // Check for uncertainty phrases in Finnish and English
  const uncertaintyPhrases = [
    'en ole varma',
    'saattaa',
    'ehkä',
    'luultavasti',
    'mahdollisesti',
    'not sure',
    'maybe',
    'perhaps',
    'possibly',
    'might',
    'could be',
  ];

  const hasUncertainty = uncertaintyPhrases.some((phrase) =>
    lowerAnswer.includes(phrase)
  );

  if (hasUncertainty) {
    warnings.push('Response contains uncertainty phrases');
    confidence = confidence === 'high' ? 'medium' : confidence;
  }

  // Check for "I don't know" patterns
  const dontKnowPhrases = [
    'en löydä',
    'en tiedä',
    'minulla ei ole',
    "i don't know",
    "i don't have",
    'cannot find',
  ];

  const isDontKnow = dontKnowPhrases.some((phrase) =>
    lowerAnswer.includes(phrase)
  );

  if (isDontKnow) {
    // This is actually good - the AI is admitting it doesn't know
    confidence = 'high';
  }

  // Check for very short answers (might be incomplete)
  if (answer.trim().length < 50 && !isDontKnow) {
    warnings.push('Response is unusually short');
    confidence = 'medium';
  }

  // Check if answer is too generic (lacks specifics)
  const genericPhrases = [
    'yleisesti',
    'tavallisesti',
    'normaalisti',
    'usually',
    'generally',
    'typically',
  ];

  const isGeneric = genericPhrases.some((phrase) =>
    lowerAnswer.includes(phrase)
  );

  if (isGeneric && !searchToolUsed) {
    warnings.push('Response appears generic without knowledge base grounding');
    confidence = 'low';
  }

  return {
    isValid: warnings.length === 0 || isDontKnow,
    warnings,
    confidence,
  };
}

/**
 * Extracts citations from an answer
 */
export function extractCitations(answer: string): string[] {
  const citations: string[] = [];

  // Look for the Lähteet section
  const sourcesMatch = answer.match(
    /(?:Lähteet:|Sources:)([\s\S]*?)(?:\n\n|$)/i
  );

  if (sourcesMatch) {
    const sourcesText = sourcesMatch[1];
    // Extract lines that look like sources (starting with -, *, or numbers)
    const lines = sourcesText.split('\n');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (
        trimmed &&
        (trimmed.startsWith('-') ||
          trimmed.startsWith('*') ||
          /^\d+\./.test(trimmed))
      ) {
        citations.push(
          trimmed.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '')
        );
      }
    });
  }

  return citations;
}
