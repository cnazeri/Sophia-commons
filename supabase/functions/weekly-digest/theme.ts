// ══════════════════════════════════════════
//  Weekly theme (owner, 2026-11-17): each issue is built around the most influential event, news
//  story or video of the week. Claude picks it from this week's items, names the theme in a few
//  words and says in one sentence why it matters, plus up to 3 related items. Without
//  ANTHROPIC_API_KEY, or on any error, a simple score picks it (featured, conferences, festivals,
//  the Goetheanum first). The pick opens the "Dear Friends" note and gets its own box at the top.
// ══════════════════════════════════════════

export const THEME_MODEL = "claude-sonnet-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";
export const MAX_RELATED = 3;

export interface Candidate {
  id: string;          // "event:<id>", "news:<id>", "video:<id>", "listing:<id>"
  kind: "event" | "news" | "video" | "listing";
  title: string;
  date?: string;
  where?: string;
  summary?: string;
  featured?: boolean;
}

export interface Theme {
  label: string;       // a few words, e.g. "Advent at the Goetheanum"
  why: string;         // one sentence on why it matters this week
  pickId: string;
  relatedIds: string[];
  source: "claude" | "score";
}

// The very top tier: the Goetheanum, conferences and other gatherings that draw people from far away
const MAJOR = /goetheanum|conference|congress|symposium|international|world/i;
const BIG = /conference|congress|symposium|world|international|goetheanum|festival|michaelmas|martinmas|advent|christmas|easter|st\.? john|anniversary|centenary|summit|annual meeting|agm/i;

// Higher is more influential. Kept simple: it only has to be a sensible fallback.
export function score(c: Candidate): number {
  let s = 0;
  if (c.featured) s += 5;
  if (BIG.test(c.title)) s += 4;
  if (MAJOR.test(`${c.title} ${c.where ?? ""}`)) s += 3;
  if (c.kind === "event") s += 2;
  if (c.kind === "news") s += 1;
  if (/online/i.test(c.where ?? "")) s += 1;   // anyone can join
  return s;
}

export function fallbackTheme(cands: Candidate[]): Theme | null {
  if (!cands.length) return null;
  const best = cands.reduce((a, b) => (score(b) > score(a) ? b : a));
  return { label: best.title, why: "", pickId: best.id, relatedIds: [], source: "score" };
}

const PROMPT = `You choose the theme of this week's Sophia Commons email. Readers are people in the anthroposophical world: Waldorf teachers and parents, biodynamic farmers, eurythmists, Camphill co-workers, members of the Christian Community and of anthroposophical branches.

You get this week's candidates as JSON (upcoming events, news, new videos, new places in the directory). Pick the ONE item with the most influence and reach for these readers: a major conference or festival, an event at the Goetheanum or a national society, a significant news story, or something many readers can join (online). Prefer something happening soon over something months away. Then pick up to ${MAX_RELATED} other candidates that relate to it (same topic, festival, place or organization), or none.

Return JSON: {"pick": "<id>", "theme": "<2 to 6 word theme name>", "why": "<one sentence on why it matters this week>", "related": ["<id>", ...]}.

Rules:
- Use only ids and facts from the JSON. Never invent events, dates, places, numbers or people.
- Plain, warm and specific. No hype, no exclamation marks. Plain keyboard characters only: straight quotes, regular hyphens, no em or en dashes, no emoji.`;

const SCHEMA = {
  type: "object",
  properties: {
    pick: { type: "string" }, theme: { type: "string" }, why: { type: "string" },
    related: { type: "array", items: { type: "string" } },
  },
  required: ["pick", "theme", "why", "related"],
  additionalProperties: false,
};

const plain = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s*[–—]\s*/g, ", ").replace(/…/g, "...").replace(/!/g, ".").replace(/\s+/g, " ").trim();

// Check Claude's answer against the candidates; anything that does not fit falls back to the score.
export function fromReply(body: unknown, cands: Candidate[]): Theme | null {
  const content = ((body as { content?: unknown[] })?.content ?? []) as { type?: string; text?: string }[];
  const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  let j: { pick?: unknown; theme?: unknown; why?: unknown; related?: unknown };
  try { j = JSON.parse(text); } catch (_) { return null; }
  const ids = new Set(cands.map((c) => c.id));
  if (typeof j.pick !== "string" || !ids.has(j.pick) || typeof j.theme !== "string" || !j.theme.trim()) return null;
  const related = (Array.isArray(j.related) ? j.related : [])
    .filter((r): r is string => typeof r === "string" && ids.has(r) && r !== j.pick);
  return {
    label: plain(j.theme).slice(0, 80), why: typeof j.why === "string" ? plain(j.why).slice(0, 300) : "",
    pickId: j.pick, relatedIds: [...new Set(related)].slice(0, MAX_RELATED), source: "claude",
  };
}

export async function chooseTheme(cands: Candidate[], apiKey: string | undefined, fetchFn: typeof fetch = fetch): Promise<Theme | null> {
  if (!cands.length) return null;
  if (!apiKey) return fallbackTheme(cands);
  try {
    const res = await fetchFn(API_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: THEME_MODEL, max_tokens: 1000, system: PROMPT,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: JSON.stringify(cands.slice(0, 40)) }],
      }),
    });
    if (!res.ok) return fallbackTheme(cands);
    return fromReply(await res.json(), cands) ?? fallbackTheme(cands);
  } catch (_) {
    return fallbackTheme(cands);
  }
}
