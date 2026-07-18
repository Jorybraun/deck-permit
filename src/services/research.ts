import { callCerebras } from './aiProvider';

export interface ResearchResult {
  query: string;
  summary: string;
  sources: { title: string; url: string; snippet: string }[];
  raw?: string;
}

/**
 * Search the web using DuckDuckGo's Instant Answer API (CORS-friendly, no key needed).
 * Returns related topics and abstract text.
 */
export async function webSearch(query: string): Promise<ResearchResult> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { query, summary: `Search failed (${res.status}).`, sources: [] };
    }

    const data = (await res.json()) as {
      Abstract?: string;
      AbstractText?: string;
      AbstractURL?: string;
      Heading?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: unknown }>;
      Definition?: string;
      DefinitionURL?: string;
    };

    const summary = data.AbstractText || data.Abstract || data.Definition || '';
    const sources: { title: string; url: string; snippet: string }[] = [];

    if (data.AbstractURL) {
      sources.push({ title: data.Heading || 'DuckDuckGo', url: data.AbstractURL, snippet: summary.slice(0, 200) });
    }

    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 8)) {
        if (topic.Text && topic.FirstURL) {
          sources.push({
            title: topic.Text.slice(0, 60),
            url: topic.FirstURL,
            snippet: topic.Text.slice(0, 200),
          });
        }
      }
    }

    return { query, summary, sources, raw: JSON.stringify(data).slice(0, 2000) };
  } catch (err) {
    return { query, summary: `Search error: ${err instanceof Error ? err.message : 'unknown'}`, sources: [] };
  }
}

/**
 * Fetch a webpage and extract readable text. Uses a CORS proxy since browsers
 * block cross-origin fetches to most sites.
 */
export async function fetchWebpage(url: string): Promise<string> {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) return `Fetch failed (${res.status}).`;

    const html = await res.text();
    // Strip HTML tags, scripts, styles - keep text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();

    return text.slice(0, 5000); // Cap at 5000 chars to keep context manageable
  } catch (err) {
    return `Fetch error: ${err instanceof Error ? err.message : 'unknown'}`;
  }
}

/**
 * Deep research on a topic using Cerebras. The model has extensive knowledge
 * of BC building codes, municipal bylaws, and permit processes. This tool
 * synthesizes that knowledge into a structured answer with citations.
 */
export async function researchTopic(
  topic: string,
  jurisdiction: string,
  apiKey: string
): Promise<ResearchResult> {
  const systemPrompt = `You are a building code and permit researcher for British Columbia. The user wants to know about: "${topic}" for jurisdiction: "${jurisdiction}".

Provide a thorough, accurate answer based on:
- BC Building Code (BCBC) - current edition
- Local municipal bylaws (e.g. Sidney Zoning Bylaw)
- BC Housing guides
- Canadian Wood Council standards

Format your response as:
SUMMARY: [2-4 sentence overview]

KEY REQUIREMENTS:
- [requirement 1 with code reference]
- [requirement 2 with code reference]
- [requirement 3 with code reference]

SOURCES:
- [source name and URL if known]
- [source name and URL if known]

If you are not certain about a specific number (setback, height limit, fee), say "verify with the municipality" rather than guessing. Always cite the BCBC section or bylaw number when possible.`;

  const { text, error } = await callCerebras(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Research: ${topic} in ${jurisdiction}` },
    ],
    apiKey
  );

  if (error) {
    return { query: topic, summary: `Research error: ${error}`, sources: [] };
  }

  // Parse the structured response - full text is used as summary
  void text.match(/SUMMARY:\s*([\s\S]*?)(?:\n\n|KEY REQUIREMENTS:)/);

  const sources: { title: string; url: string; snippet: string }[] = [];
  const sourceSection = text.match(/SOURCES:\s*([\s\S]*?)$/);
  if (sourceSection) {
    const sourceLines = sourceSection[1].split('\n').filter((l) => l.trim().startsWith('-'));
    for (const line of sourceLines) {
      const cleaned = line.replace(/^-\s*/, '').trim();
      const urlMatch = cleaned.match(/(https?:\/\/[^\s]+)/);
      sources.push({
        title: cleaned.replace(/https?:\/\/[^\s]+/, '').trim() || cleaned.slice(0, 60),
        url: urlMatch ? urlMatch[1] : '',
        snippet: cleaned.slice(0, 200),
      });
    }
  }

  return { query: topic, summary: text, sources, raw: text };
}

/**
 * Look up permit submission requirements for a specific BC municipality.
 * Returns what forms, drawings, fees, and process steps are needed.
 */
export async function researchPermitRequirements(
  municipality: string,
  projectType: string,
  apiKey: string
): Promise<ResearchResult> {
  const topic = `permit requirements for ${projectType} in ${municipality}, BC - what forms, drawings, fees, and process steps are required`;
  return researchTopic(topic, municipality, apiKey);
}
