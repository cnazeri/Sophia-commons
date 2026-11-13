import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { localDay } from "./local_day.ts";

Deno.test("evening Pacific event keeps its local date", () => {
  assertEquals(localDay("2026-11-15T02:30:00Z", "America/Los_Angeles"), { month: "NOV", day: 14 });
});
Deno.test("Sydney event moves to the next local day", () => {
  assertEquals(localDay("2026-12-26T07:00:00Z", "Australia/Sydney"), { month: "DEC", day: 26 });
  assertEquals(localDay("2026-12-25T20:00:00Z", "Australia/Sydney"), { month: "DEC", day: 26 });
});
Deno.test("missing or bad time zone falls back to UTC", () => {
  assertEquals(localDay("2026-11-15T02:30:00Z", null), { month: "NOV", day: 15 });
  assertEquals(localDay("2026-11-15T02:30:00Z", "Not/AZone"), { month: "NOV", day: 15 });
});
