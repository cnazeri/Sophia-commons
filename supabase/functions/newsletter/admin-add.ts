// ══════════════════════════════════════════
//  Admin > Members: add people to the newsletter by hand (owner, 2026-10-24), for people who
//  asked in person or by email. They are added as confirmed, with source "admin", and no
//  confirmation email is sent. Anyone who unsubscribed is never re-added.
// ══════════════════════════════════════════

export const MAX_ADD = 200;   // per request
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface Entry { email: string; name: string }
export interface Existing { id: string; email: string; name: string | null; confirmed: boolean; unsubscribed_at: string | null }
export interface Plan {
  inserts: Entry[];
  confirms: { id: string; name: string }[];   // rows that signed up but never clicked the link
  already: string[];
  unsubscribed: string[];
  invalid: string[];
}

// Clean and de-duplicate the list; bad addresses are reported, not dropped silently.
export function cleanEntries(raw: unknown): { entries: Entry[]; invalid: string[] } {
  const seen = new Set<string>();
  const entries: Entry[] = [];
  const invalid: string[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const email = String((r as Entry)?.email ?? "").trim().toLowerCase();
    const name = String((r as Entry)?.name ?? "").trim().slice(0, 120);
    if (!EMAIL_RE.test(email) || email.length > 254) { if (email) invalid.push(email); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    entries.push({ email, name });
  }
  return { entries, invalid };
}

export function planAdds(entries: Entry[], existing: Existing[], invalid: string[] = []): Plan {
  const byEmail = new Map(existing.map((e) => [e.email.toLowerCase(), e]));
  const plan: Plan = { inserts: [], confirms: [], already: [], unsubscribed: [], invalid };
  for (const e of entries) {
    const row = byEmail.get(e.email);
    if (!row) plan.inserts.push(e);
    else if (row.unsubscribed_at) plan.unsubscribed.push(e.email);
    else if (row.confirmed) plan.already.push(e.email);
    else plan.confirms.push({ id: row.id, name: row.name || e.name });
  }
  return plan;
}
