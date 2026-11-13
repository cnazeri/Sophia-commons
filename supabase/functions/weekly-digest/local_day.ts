// The event's own calendar day: a 6:30 pm Pacific event on Saturday is still Saturday, not Sunday in UTC
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function localDay(iso: string, tz?: string | null): { month: string; day: number } {
  const d = new Date(iso);
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", month: "short", day: "numeric" }).formatToParts(d);
    return {
      month: parts.find((x) => x.type === "month")!.value.toUpperCase(),
      day: Number(parts.find((x) => x.type === "day")!.value),
    };
  } catch (_) {
    // unknown time zone name: fall back to the UTC day
    return { month: MON[d.getUTCMonth()], day: d.getUTCDate() };
  }
}
