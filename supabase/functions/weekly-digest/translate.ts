// ══════════════════════════════════════════
//  English-only newsletter: translate digest text with Claude.
//  One batched call per digest. Needs the ANTHROPIC_API_KEY edge secret; without it (or on any
//  error) the original text is kept, so a missing key never blocks the weekly draft.
// ══════════════════════════════════════════

export const TRANSLATE_MODEL = "claude-haiku-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";

export interface Translated {
  en: string;        // English text (the original when it was already English)
  language: string;  // language of the original, in English ("English", "German", ...)
}

const PROMPT = `You translate short items for an English-language newsletter about anthroposophy (Rudolf Steiner, Waldorf education, biodynamic farming, eurythmy, the Christian Community).

You get a JSON array of strings. Return ONLY a JSON array of the same length, in the same order, where each item is {"en": "...", "language": "..."}:
- "en": the text in natural English. If it is already English, copy it unchanged. Keep names of people, organizations, places and book titles as they are; you may add a short English gloss in parentheses for a book or lecture title.
- "language": the original language as an English word, e.g. "English", "German", "Spanish", "Russian".
Use plain keyboard punctuation only: straight quotes, regular hyphens, no em or en dashes.`;

// Parse the model's reply; returns null unless it is an array of the expected length and shape.
export function parseTranslations(reply: string, expected: number): Translated[] | null {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  let arr: unknown;
  try { arr = JSON.parse(reply.slice(start, end + 1)); } catch (_) { return null; }
  if (!Array.isArray(arr) || arr.length !== expected) return null;
  const out: Translated[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") return null;
    const { en, language } = item as Record<string, unknown>;
    if (typeof en !== "string" || !en.trim()) return null;
    out.push({ en: en.trim(), language: typeof language === "string" && language.trim() ? language.trim() : "English" });
  }
  return out;
}

const keep = (texts: string[]): Translated[] => texts.map((t) => ({ en: t, language: "English" }));

// Returns one entry per input text. ok=false means the originals were kept.
export async function translateToEnglish(
  texts: string[],
  apiKey: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<{ items: Translated[]; ok: boolean; reason?: string }> {
  // only non-empty text goes to the model; empty strings come back empty
  const idx = texts.map((t, i) => (t.trim() ? i : -1)).filter((i) => i !== -1);
  if (!idx.length) return { items: keep(texts), ok: true };
  if (!apiKey) return { items: keep(texts), ok: false, reason: "ANTHROPIC_API_KEY is not set" };
  try {
    const res = await fetchFn(API_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: TRANSLATE_MODEL,
        max_tokens: 8000,
        system: PROMPT,
        messages: [{ role: "user", content: JSON.stringify(idx.map((i) => texts[i])) }],
      }),
    });
    if (!res.ok) return { items: keep(texts), ok: false, reason: `translation API returned ${res.status}` };
    const body = await res.json();
    const reply = (body?.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
    const got = parseTranslations(reply, idx.length);
    if (!got) return { items: keep(texts), ok: false, reason: "translation reply was not usable" };
    const items = keep(texts);
    idx.forEach((orig, j) => { items[orig] = got[j]; });
    return { items, ok: true };
  } catch (e) {
    return { items: keep(texts), ok: false, reason: `translation failed: ${(e as Error).message}` };
  }
}

// The parts of a digest that get translated (index.ts adds more fields; they pass through).
interface DigestText {
  videos: { title: string; summary: string }[];
  events: { title: string }[];
  news: { title: string; excerpt: string | null }[];
}

// The newsletter is English only: translate titles and summaries in one batch. Names of
// listings stay as they are. A video or event in another language keeps a "(in German)" note
// so readers know what they will hear.
export async function englishOnly<D extends DigestText>(d: D, apiKey: string | undefined, fetchFn: typeof fetch = fetch) {
  const texts = [
    ...d.videos.flatMap((v) => [v.title, v.summary]),
    ...d.events.map((e) => e.title),
    ...d.news.flatMap((n) => [n.title, n.excerpt ?? ""]),
  ];
  const { items, ok, reason } = await translateToEnglish(texts, apiKey, fetchFn);
  let i = 0;
  const next = () => items[i++];
  const note = (lang: string) => (lang && lang !== "English" ? ` (in ${lang})` : "");
  const videos = d.videos.map((v) => { const t = next(), s = next(); return { ...v, title: t.en + note(t.language), summary: s.en }; });
  const events = d.events.map((e) => { const t = next(); return { ...e, title: t.en + note(t.language) }; });
  const news = d.news.map((n) => { const t = next(), x = next(); return { ...n, title: t.en, excerpt: n.excerpt ? x.en : n.excerpt }; });
  return { digest: { ...d, videos, events, news }, translated: ok, reason };
}
