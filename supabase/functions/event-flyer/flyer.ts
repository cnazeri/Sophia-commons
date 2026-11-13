// What event-flyer asks Claude for, and how the answer is cleaned before it reaches the form.

export const EVENT_TYPES = ["workshop", "conference", "study_group", "festival", "retreat", "other"];
const FIELDS = ["title", "type", "description", "price", "start_date", "start_time", "end_date", "end_time", "timezone",
  "is_online", "online_url", "venue", "address", "city", "region", "country", "organizer", "organizer_url"] as const;

export const FLYER_SCHEMA = {
  type: "object",
  properties: {
    is_event_flyer: { type: "boolean" },
    title: { type: "string" },
    type: { type: "string", enum: EVENT_TYPES },
    description: { type: "string" },
    price: { type: "string" },
    start_date: { type: "string" },
    start_time: { type: "string" },
    end_date: { type: "string" },
    end_time: { type: "string" },
    timezone: { type: "string" },
    is_online: { type: "boolean" },
    online_url: { type: "string" },
    venue: { type: "string" },
    address: { type: "string" },
    city: { type: "string" },
    region: { type: "string" },
    country: { type: "string" },
    organizer: { type: "string" },
    organizer_url: { type: "string" },
  },
  required: ["is_event_flyer", "title", "type", "description", "price", "start_date", "start_time", "end_date", "end_time",
    "timezone", "is_online", "online_url", "venue", "address", "city", "region", "country", "organizer", "organizer_url"],
  additionalProperties: false,
};

export function flyerPrompt(today: string, viewerZone: string): string {
  return `This picture should be a flyer for an event in the anthroposophical world (Waldorf, biodynamic, Camphill,
The Christian Community, a study group, a festival, a talk). Read it and fill in the event form.

Rules:
- Use only what the flyer says. Leave a field as "" when the flyer does not say it. Never guess a date, time,
  address or price.
- Today is ${today}. When the flyer gives a day and month but no year, use the next such date from today.
- Dates as YYYY-MM-DD, times as 24-hour HH:MM. end_date only when it runs over more than one day.
- timezone: the IANA name for where the event takes place (for example America/Los_Angeles) when the place makes it
  clear; for an online event with no place, "${viewerZone || ""}".
- description: the flyer's own wording about the event, tidied into short plain paragraphs (who leads it, what
  happens, any schedule, how to register or contact). Keep names and email addresses exactly as printed.
- price: as printed, short ("$30, students $15", "Free", "Donation"). type: the closest of the choices.
- No em or en dashes, straight quotes only.
- is_event_flyer: false when the picture is not an event flyer (then leave everything else empty).`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Only known fields, plain characters, and dates/times in the form the inputs accept
export function cleanFields(raw: unknown): Record<string, string | boolean> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (r.is_event_flyer === false) return {};
  const out: Record<string, string | boolean> = {};
  for (const f of FIELDS) {
    const v = r[f];
    if (f === "is_online") { out[f] = v === true; continue; }
    let s = String(v ?? "").replace(/[–—]/g, ", ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
    if (f !== "description") s = s.replace(/\s+/g, " ");
    s = s.slice(0, f === "description" ? 5000 : f.endsWith("url") ? 500 : 200);
    if ((f === "start_date" || f === "end_date") && !DATE.test(s)) s = "";
    if ((f === "start_time" || f === "end_time") && !TIME.test(s)) s = "";
    if (f === "type" && !EVENT_TYPES.includes(s)) s = "other";
    if (f.endsWith("url") && s && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(s) && !/^[^\s@]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) s = "";
    if (s) out[f] = s;
  }
  return out;
}
