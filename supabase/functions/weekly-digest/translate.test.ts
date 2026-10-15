// Run: node --test translate.test.ts   (Node 23.6+ strips the types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { englishOnly, parseTranslations, translateToEnglish } from "./translate.ts";

const digest = {
  weekOf: "October 19, 2026",
  videos: [{ title: "Helmut Zander über Rudolf Steiners Spiritualität", summary: "Ein Vortrag.", url: "u" }],
  events: [{ title: "Michaeli-Tagung" }, { title: "Waldorf open day" }],
  news: [{ title: "News in English", excerpt: null }],
  listings: [{ organization_name: "Freie Waldorfschule Kassel" }],
};
const reply = [
  { en: "Helmut Zander on Rudolf Steiner's spirituality", language: "German" },
  { en: "A lecture.", language: "German" },
  { en: "Michaelmas conference", language: "German" },
  { en: "Waldorf open day", language: "English" },
  { en: "News in English", language: "English" },
];
const fakeFetch = (async () => new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(reply) }] }), { status: 200 })) as typeof fetch;

test("translates titles and notes the original language", async () => {
  const { digest: d, translated } = await englishOnly(digest, "key", fakeFetch);
  assert.equal(translated, true);
  assert.equal(d.videos[0].title, "Helmut Zander on Rudolf Steiner's spirituality (in German)");
  assert.equal(d.videos[0].summary, "A lecture.");
  assert.equal(d.videos[0].url, "u");
  assert.equal(d.events[0].title, "Michaelmas conference (in German)");
  assert.equal(d.events[1].title, "Waldorf open day");
  assert.equal(d.news[0].excerpt, null);
  assert.equal(d.listings[0].organization_name, "Freie Waldorfschule Kassel");
  assert.equal(digest.videos[0].title, "Helmut Zander über Rudolf Steiners Spiritualität"); // input untouched
});

test("no API key keeps the originals and says why", async () => {
  const { digest: d, translated, reason } = await englishOnly(digest, undefined, fakeFetch);
  assert.equal(translated, false);
  assert.match(reason ?? "", /ANTHROPIC_API_KEY/);
  assert.equal(d.events[0].title, "Michaeli-Tagung");
});

test("API error or bad reply falls back to originals", async () => {
  const err = (async () => new Response("no", { status: 529 })) as typeof fetch;
  assert.equal((await translateToEnglish(["Hallo"], "k", err)).ok, false);
  const short = (async () => new Response(JSON.stringify({ content: [{ text: "[]" }] }), { status: 200 })) as typeof fetch;
  const r = await translateToEnglish(["Hallo"], "k", short);
  assert.equal(r.ok, false);
  assert.equal(r.items[0].en, "Hallo");
});

test("empty strings are not sent", async () => {
  let sent: string[] = [];
  const spy = (async (_u: string, init: RequestInit) => {
    sent = JSON.parse(JSON.parse(String(init.body)).messages[0].content);
    return new Response(JSON.stringify({ content: [{ text: '[{"en":"Hello","language":"German"}]' }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await translateToEnglish(["", "Hallo", "  "], "k", spy);
  assert.deepEqual(sent, ["Hallo"]);
  assert.deepEqual(r.items.map((x) => x.en), ["", "Hello", "  "]);
});

test("parseTranslations rejects wrong shapes", () => {
  assert.equal(parseTranslations("not json", 1), null);
  assert.equal(parseTranslations('[{"en":""}]', 1), null);
  assert.deepEqual(parseTranslations('Here: [{"en":"Hi","language":"German"}]', 1), [{ en: "Hi", language: "German" }]);
});
