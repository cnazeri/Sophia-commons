// Run: node --test theme.test.ts   (Node 23.6+ strips the types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseTheme, fallbackTheme, fromReply } from "./theme.ts";
import type { Candidate } from "./theme.ts";

const cands: Candidate[] = [
  { id: "event:1", kind: "event", title: "After school craft club", date: "2026-11-20", where: "Chestnut Ridge, USA" },
  { id: "event:2", kind: "event", title: "Advent Festival at the Goetheanum", date: "2026-11-29", where: "Dornach, Switzerland" },
  { id: "news:3", kind: "news", title: "New biodynamic certification rules" },
  { id: "event:4", kind: "event", title: "Advent spiral walk", date: "2026-11-30", where: "Online" },
];
const reply = (obj: unknown) => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });

test("the fallback score prefers a big festival or conference", () => {
  assert.equal(fallbackTheme(cands)?.pickId, "event:2");
  assert.equal(fallbackTheme([]), null);
});

test("fromReply keeps a valid pick, cleans the text and drops unknown or duplicate related ids", () => {
  const t = fromReply(reply({ pick: "event:2", theme: "Advent — at the Goetheanum!", why: "It’s the start of Advent.", related: ["event:4", "event:9", "event:2", "event:4"] }), cands);
  assert.equal(t?.pickId, "event:2");
  assert.equal(t?.label, "Advent, at the Goetheanum.");
  assert.equal(t?.why, "It's the start of Advent.");
  assert.deepEqual(t?.relatedIds, ["event:4"]);
  assert.equal(t?.source, "claude");
});

test("fromReply rejects a pick that is not one of the candidates", () => {
  assert.equal(fromReply(reply({ pick: "event:99", theme: "x", why: "", related: [] }), cands), null);
  assert.equal(fromReply({ content: [{ type: "text", text: "not json" }] }, cands), null);
});

test("chooseTheme falls back to the score without a key or on an API error", async () => {
  assert.equal((await chooseTheme(cands, undefined))?.source, "score");
  const fail = (async () => new Response("x", { status: 500 })) as typeof fetch;
  assert.equal((await chooseTheme(cands, "k", fail))?.pickId, "event:2");
  const ok = (async () => new Response(JSON.stringify(reply({ pick: "news:3", theme: "Biodynamic standards", why: "New rules.", related: [] })))) as typeof fetch;
  assert.equal((await chooseTheme(cands, "k", ok))?.pickId, "news:3");
});
