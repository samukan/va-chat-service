import 'dotenv/config';

function toYesNo(value) {
  return value ? 'yes' : 'no';
}

function maskValue(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '(empty)';
  }

  if (text.length <= 8) {
    return `${text.slice(0, 2)}***${text.slice(-1)}`;
  }

  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

if (process.env.DEBUG_ENV === '1') {
  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasSingleVectorStore = Boolean(process.env.RAG_VECTOR_STORE_ID?.trim());
  const hasPluralVectorStores = Boolean(process.env.RAG_VECTOR_STORE_IDS?.trim());

  console.log(`[env] OPENAI_API_KEY present: ${toYesNo(hasOpenAiKey)}`);
  console.log(
    `[env] RAG_VECTOR_STORE_ID present: ${toYesNo(hasSingleVectorStore)}${
      hasSingleVectorStore
        ? ` (${maskValue(process.env.RAG_VECTOR_STORE_ID)})`
        : ''
    }`
  );
  console.log(
    `[env] RAG_VECTOR_STORE_IDS present: ${toYesNo(hasPluralVectorStores)}${
      hasPluralVectorStores
        ? ` (${process.env.RAG_VECTOR_STORE_IDS
            .split(',')
            .map((value) => maskValue(value))
            .join(', ')})`
        : ''
    }`
  );
}
