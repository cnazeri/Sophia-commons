// Run: node --test letter.test.ts   (Node 23.6+ strips the types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanParagraphs, noteHtml, writeLetter } from "./letter.ts";

const week = {
  events: [{ start_date: "2026-10-31", title: "Mani webinar", is_online: true }],
  videos: [], listings: [], news: [],
};

test("cleanParagraphs keeps plain characters and drops greeting and sign-off", () => {
  const out = cleanParagraphs(["Dear Friends,", "It’s a full week — three talks…", "Warmly, Cameron", 42]);
  assert.deepEqual(out, ["It's a full week, three talks..."]);
});

test("noteHtml uses the admin note markers and escapes text", () => {
  const h = noteHtml(["A <b>bold</b> week"]);
  assert.ok(h.startsWith("<!--note-->") && h.endsWith("<!--/note-->"));
  assert.ok(h.includes("Dear Friends,") && h.includes("Warmly,<br>Cameron"));
  assert.ok(h.includes("A &lt;b&gt;bold&lt;/b&gt; week"));
  assert.equal(noteHtml([]), "");
});

test("writeLetter returns no note without a key or on an API error", async () => {
  assert.equal((await writeLetter(week, undefined)).html, "");
  const fail = (async () => new Response("x", { status: 500 })) as typeof fetch;
  const r = await writeLetter(week, "k", fail);
  assert.equal(r.html, "");
  assert.match(r.reason ?? "", /500/);
});

test("writeLetter builds the note from the JSON reply", async () => {
  const ok = (async () => Response.json({ content: [{ type: "text", text: JSON.stringify({ paragraphs: ["The Mani webinar is online on October 31.", "Thanks for reading."] }) }] })) as typeof fetch;
  const r = await writeLetter(week, "k", ok);
  assert.ok(r.html.includes("The Mani webinar is online on October 31."));
});
