import OpenAI from 'openai';
import { toFile } from 'openai/uploads';

type IngestBody = {
  url: string;
  vector_store_id?: string;
  vector_store_name?: string;
  filename?: string;
};

export async function POST(request: Request) {
  try {
    const { url, vector_store_id, vector_store_name, filename }: IngestBody =
      await request.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: url' }),
        { status: 400 }
      );
    }

    const openai = new OpenAI();

    // 1) Fetch page
    const res = await fetch(url);
    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: `Failed to fetch URL (${res.status} ${res.statusText})`,
        }),
        { status: 400 }
      );
    }
    const html = await res.text();

    // 2) Naive HTML -> text extraction (lightweight; replace with proper parser if needed)
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Prepend source URL for transparency
    const text = `Source: ${url}\n\n${stripped}`;

    // 3) Ensure we have a vector store
    let vsId = vector_store_id;
    if (!vsId) {
      const created = await openai.vectorStores.create({
        name: vector_store_name || 'Web Ingest',
      });
      vsId = created.id;
    }

    // 4) Upload as a file
    const safeName =
      filename ||
      (new URL(url).hostname + new URL(url).pathname).replace(
        /[^a-z0-9_.-]+/gi,
        '-'
      ) + '.txt';

    const blob = new Blob([text], { type: 'text/plain' });
    const file = await openai.files.create({
      file: await toFile(blob, safeName),
      purpose: 'assistants',
    });

    // 5) Attach file to vector store
    const attached = await openai.vectorStores.files.create(vsId!, {
      file_id: file.id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        vector_store_id: vsId,
        file: { id: file.id, name: safeName },
        attachment: attached,
      }),
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error ingesting URL:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500 }
    );
  }
}
