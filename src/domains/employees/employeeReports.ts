import type { MarketingActivity, MarketingActivityType } from "../erp.types";
import { fieldActivityTypes, followUpActivityTypes, salesResultActivityTypes } from "../marketing/activityCategories";

export type EmployeeReportFrequency = "Daily" | "Weekly" | "Monthly" | "Custom";
export type EmployeeReportKind = "Complete" | "Activity" | "Field Work" | "Sales & Collection" | "Follow-ups";

export type EmployeeReportDateInput = {
  date: string;
  weekDate: string;
  month: string;
  customFrom: string;
  customTo: string;
};

function atNoon(value: string) {
  return new Date(`${value}T12:00:00`);
}

function isoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shift(value: string, days: number) {
  const date = atNoon(value);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

export function employeeReportPeriod(frequency: EmployeeReportFrequency, input: EmployeeReportDateInput, today: string) {
  if (frequency === "Daily") return { from: input.date, to: input.date };
  if (frequency === "Weekly") {
    const selected = atNoon(input.weekDate);
    const mondayOffset = (selected.getDay() + 6) % 7;
    const from = shift(input.weekDate, -mondayOffset);
    const sunday = shift(from, 6);
    return { from, to: from <= today && sunday >= today ? today : sunday };
  }
  if (frequency === "Monthly") {
    const [year, month] = input.month.split("-").map(Number);
    const last = isoDate(new Date(year, month, 0, 12));
    return { from: `${input.month}-01`, to: input.month === today.slice(0, 7) ? today : last };
  }
  return { from: input.customFrom, to: input.customTo < input.customFrom ? input.customFrom : input.customTo };
}

const activityTypesByReport: Partial<Record<EmployeeReportKind, MarketingActivityType[]>> = {
  "Field Work": fieldActivityTypes,
  "Sales & Collection": salesResultActivityTypes,
  "Follow-ups": followUpActivityTypes
};

export function filterEmployeeReportActivities(activities: MarketingActivity[], kind: EmployeeReportKind) {
  const allowed = activityTypesByReport[kind];
  if (!allowed) return activities;
  return activities.filter((activity) => allowed.includes(activity.activityType));
}

export function employeeReportTitle(kind: EmployeeReportKind, frequency: EmployeeReportFrequency) {
  const subject = kind === "Complete" ? "Activity & Performance" : kind === "Activity" ? "Activity Detail" : kind;
  return `${frequency} Employee ${subject} Report`;
}
