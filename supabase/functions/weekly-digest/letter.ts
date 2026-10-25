// ══════════════════════════════════════════
//  The personal note at the top of the weekly email ("Dear Friends, ... Warmly, Cameron").
//  Claude drafts it from this week's events, videos, listings and news; the owner can edit it
//  in Admin > Weekly Digest before approving (owner, 2026-10-24). Same markup as the admin note
//  editor (sophia_commons_v9.js _digestNoteHtml), so the editor reads and rewrites it.
//  Without ANTHROPIC_API_KEY, or on any error, the draft simply has no note.
// ══════════════════════════════════════════

export const LETTER_MODEL = "claude-sonnet-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const MAX_PARAGRAPHS = 4;

const PROMPT = `You write the short personal note that opens the Sophia Commons weekly email, signed by Cameron, who runs the site. Readers are people in the anthroposophical world: Waldorf teachers and parents, biodynamic farmers, eurythmists, Camphill co-workers, members of the Christian Community and of anthroposophical branches.

You get this week's material as JSON: upcoming events (date, title, place, online or not), new videos, new places in the directory and recent news. Write 2 or 3 short paragraphs (each 1 to 3 sentences) in Cameron's voice:
- Open with what stands out on the calendar this week: name 2 to 4 specific events with their dates and places. Mention online events for people who can't travel, if there are any.
- Then, if something is worth it, one paragraph on a video, a news story or new places in the directory.
- End with a short thank-you, for example for reading and for passing the email along.

Rules:
- Use only facts in the JSON. Never invent events, dates, places, numbers, people or site features.
- Warm, plain and specific, like a friend writing. Contractions are fine. No hype, no exclamation marks.
- Don't write the greeting ("Dear Friends,") or the sign-off; they are added for you.
- Plain keyboard characters only: straight quotes and apostrophes, regular hyphens, no em or en dashes, no emoji.
- Avoid these words: delve, tapestry, landscape, leverage, robust, seamless, vibrant, journey, rich, embark.

Example of the voice (from an earlier week):
"It's a full stretch on the calendar. The Theatre Festival at the Goetheanum runs October 23 to 25, and the Lilly Kolisko Conference meets in London on the 18th. If you can't travel, several talks this week are online, including Andrew Linnell on working with Vulcan beings."

Return JSON: {"paragraphs": ["...", "..."]}.`;

// Structured output: the reply is JSON matching this schema (this model does not take a forced tool call).
const SCHEMA = {
  type: "object",
  properties: { paragraphs: { type: "array", items: { type: "string" } } },
  required: ["paragraphs"],
  additionalProperties: false,
};

export interface LetterInput {
  events: { start_date: string; title: string; is_online?: boolean | null; location_name?: string | null; city?: string | null; country?: string | null }[];
  videos: { title: string; channel: string; summary?: string }[];
  listings: { organization_name: string; city?: string | null; country?: string | null }[];
  news: { title: string; excerpt?: string | null }[];
}

function facts(d: LetterInput) {
  return {
    events: d.events.slice(0, 10).map((e) => ({
      date: e.start_date, title: e.title,
      where: e.is_online ? "online" : (e.location_name || [e.city, e.country].filter(Boolean).join(", ")),
    })),
    videos: d.videos.slice(0, 6).map((v) => ({ title: v.title, channel: v.channel, summary: (v.summary || "").slice(0, 200) })),
    new_places: d.listings.slice(0, 12).map((l) => [l.organization_name, l.city, l.country].filter(Boolean).join(", ")),
    news: d.news.slice(0, 5).map((n) => ({ title: n.title, excerpt: (n.excerpt || "").slice(0, 200) })),
  };
}

// The JSON text of a Messages API reply ({"paragraphs": [...]}), or null.
export function fromReply(body: unknown): unknown {
  const content = ((body as { content?: unknown[] })?.content ?? []) as { type?: string; text?: string }[];
  const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  try { return (JSON.parse(text) as { paragraphs?: unknown }).paragraphs ?? null; } catch (_) { return null; }
}

// Keep the note to plain characters, whatever the model returns.
export function cleanParagraphs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === "string")
    .map((p) => p.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/\s*[\u2013\u2014]\s*/g, ", ").replace(/\u2026/g, "...").replace(/\s+/g, " ").trim())
    .filter((p) => p && !/^dear friends/i.test(p) && !/^(warmly|best|cameron)\b/i.test(p))
    .slice(0, MAX_PARAGRAPHS);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const P = `style="margin:0 0 14px;color:#1E1810"`;

export function noteHtml(paragraphs: string[]): string {
  if (!paragraphs.length) return "";
  return `<!--note--><div style="margin:0 0 28px;padding:0 0 22px;border-bottom:1px solid #E8E2DA">`
    + `<p ${P}>Dear Friends,</p>`
    + paragraphs.map((p) => `<p ${P}>${esc(p)}</p>`).join("")
    + `<p style="margin:0;color:#1E1810">Warmly,<br>Cameron</p></div><!--/note-->`;
}

export async function writeLetter(d: LetterInput, apiKey: string | undefined, fetchFn: typeof fetch = fetch): Promise<{ html: string; reason?: string }> {
  if (!apiKey) return { html: "", reason: "no ANTHROPIC_API_KEY" };
  if (!d.events.length && !d.videos.length && !d.listings.length && !d.news.length) return { html: "", reason: "nothing to write about" };
  try {
    const res = await fetchFn(API_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: LETTER_MODEL,
        max_tokens: 4000,
        system: PROMPT,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: JSON.stringify(facts(d)) }],
      }),
    });
    if (!res.ok) return { html: "", reason: `Claude HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const body = await res.json();
    const paras = cleanParagraphs(fromReply(body));
    return paras.length ? { html: noteHtml(paras) } : { html: "", reason: "empty note" };
  } catch (e) {
    return { html: "", reason: (e as Error).message };
  }
}
