import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanEntries, planAdds } from "./admin-add.ts";

test("cleanEntries lowercases, de-duplicates and reports bad addresses", () => {
  const { entries, invalid } = cleanEntries([
    { email: " Anna@Example.org ", name: "Anna" },
    { email: "anna@example.org", name: "Anna again" },
    { email: "not-an-email", name: "" },
    { email: "", name: "blank" },
  ]);
  assert.deepEqual(entries, [{ email: "anna@example.org", name: "Anna" }]);
  assert.deepEqual(invalid, ["not-an-email"]);
  assert.deepEqual(cleanEntries("nope"), { entries: [], invalid: [] });
});

test("planAdds never re-adds someone who unsubscribed", () => {
  const plan = planAdds(
    [
      { email: "new@x.org", name: "New" },
      { email: "sub@x.org", name: "" },
      { email: "gone@x.org", name: "" },
      { email: "pending@x.org", name: "Pat" },
    ],
    [
      { id: "1", email: "sub@x.org", name: null, confirmed: true, unsubscribed_at: null },
      { id: "2", email: "gone@x.org", name: null, confirmed: false, unsubscribed_at: "2026-10-01" },
      { id: "3", email: "pending@x.org", name: null, confirmed: false, unsubscribed_at: null },
    ],
  );
  assert.deepEqual(plan.inserts, [{ email: "new@x.org", name: "New" }]);
  assert.deepEqual(plan.already, ["sub@x.org"]);
  assert.deepEqual(plan.unsubscribed, ["gone@x.org"]);
  assert.deepEqual(plan.confirms, [{ id: "3", name: "Pat" }]);
});
