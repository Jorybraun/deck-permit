const CEREBRAS_ENDPOINT = 'https://api.cerebras.ai/v1/chat/completions';
const CEREBRAS_MODEL = 'gpt-oss-120b';

export interface CerebrasMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CerebrasResponse {
  text: string;
  error?: string;
}

export async function callCerebras(
  messages: CerebrasMessage[],
  apiKey: string
): Promise<CerebrasResponse> {
  try {
    const res = await fetch(CEREBRAS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CEREBRAS_MODEL,
        messages,
        max_tokens: 1024,
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { text: '', error: `Cerebras error ${res.status}: ${body}` };
    }

    const data = (await res.json()) as {
      choices?: [{ message?: { content?: string } }];
      error?: { message?: string };
    };

    if (data.error) {
      return { text: '', error: data.error.message || 'Unknown Cerebras error' };
    }

    const text = data.choices?.[0]?.message?.content?.trim() || '';
    return { text };
  } catch (err) {
    return { text: '', error: err instanceof Error ? err.message : 'Network error' };
  }
}

/**
 * Extract structured deck design parameters from natural language.
 * Returns a JSON string that can be parsed by the caller.
 */
export async function interpretDeckIntent(
  userText: string,
  apiKey: string
): Promise<CerebrasResponse> {
  const systemPrompt = `You are a helpful assistant for a deck permit app. The user describes a deck they want to build.
Extract these fields and return ONLY a JSON object, no markdown, no prose:
{
  "shape": "rectangle" | "l-shape" | "wraparound" | null,
  "width_m": number | null,
  "depth_m": number | null,
  "height_mm": number | null,
  "materials": string | null,
  "features": ["stairs", "guard", "privacy-screen", "pergola", "built-in-bench"] | [],
  "notes": string | null
}

Rules:
- Convert feet/inches to meters.
- If dimensions are missing, set to null.
- height_mm: estimate above-grade height in millimeters. "ground level" = 300, "low" = 600, "raised" = 1200, "second story" = 2400.
- features: only include if clearly mentioned.
- Keep notes under 20 words.`;

  return callCerebras(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    apiKey
  );
}

/**
 * Answer a building-code / permitting question for BC and Sidney.
 */
export async function answerCodeQuestion(
  userText: string,
  apiKey: string
): Promise<CerebrasResponse> {
  const systemPrompt = `You are a helpful deck-permit assistant for British Columbia, Canada. Answer the user's question about deck building codes, the BC Building Code, and the Town of Sidney bylaws. Be concise (2-3 sentences). If you don't know, say "I don't have that specific information." Always cite the relevant BCBC section or bylaw if known. Do not make up numeric requirements.`;

  return callCerebras(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    apiKey
  );
}
