export type PeriodPreset = "today" | "yesterday" | "this-week" | "last-week" | "this-month" | "last-month" | "this-year" | "last-year" | "custom";
export type Grouping = "Daily" | "Weekly" | "Monthly" | "Yearly";

export const presets: Array<{ value: PeriodPreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-week", label: "This Week" },
  { value: "last-week", label: "Last Week" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "this-year", label: "This Year" },
  { value: "last-year", label: "Last Year" },
  { value: "custom", label: "Custom" }
];

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function periodFor(preset: PeriodPreset, today: string) {
  if (preset === "today" || preset === "custom") return { from: today, to: today };
  if (preset === "yesterday") { const day = shiftDate(today, -1); return { from: day, to: day }; }
  const date = new Date(`${today}T00:00:00Z`);
  const monday = shiftDate(today, -((date.getUTCDay() + 6) % 7));
  if (preset === "this-week") return { from: monday, to: today };
  if (preset === "last-week") return { from: shiftDate(monday, -7), to: shiftDate(monday, -1) };
  const [year, month] = today.split("-").map(Number);
  if (preset === "last-month") return { from: new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10), to: new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10) };
  if (preset === "this-year") return { from: `${year}-01-01`, to: today };
  if (preset === "last-year") return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  return { from: `${today.slice(0, 7)}-01`, to: today };
}
