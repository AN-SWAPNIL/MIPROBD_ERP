import assert from "node:assert/strict";
import test from "node:test";
import type { MarketingActivity } from "../erp.types";
import { employeeReportPeriod, filterEmployeeReportActivities } from "./employeeReports";

const input = { date: "2026-08-27", weekDate: "2026-08-27", month: "2026-08", customFrom: "2026-08-01", customTo: "2026-08-27" };

test("employee reports produce daily, current-week and current-month periods", () => {
  assert.deepEqual(employeeReportPeriod("Daily", input, "2026-08-27"), { from: "2026-08-27", to: "2026-08-27" });
  assert.deepEqual(employeeReportPeriod("Weekly", input, "2026-08-27"), { from: "2026-08-24", to: "2026-08-27" });
  assert.deepEqual(employeeReportPeriod("Monthly", input, "2026-08-27"), { from: "2026-08-01", to: "2026-08-27" });
});

test("employee reports use complete historical weeks and months", () => {
  const historical = { ...input, weekDate: "2026-08-12", month: "2026-07" };
  assert.deepEqual(employeeReportPeriod("Weekly", historical, "2026-08-27"), { from: "2026-08-10", to: "2026-08-16" });
  assert.deepEqual(employeeReportPeriod("Monthly", historical, "2026-08-27"), { from: "2026-07-01", to: "2026-07-31" });
});

test("report kinds deterministically select their related activities", () => {
  const activity = (id: string, activityType: MarketingActivity["activityType"]): MarketingActivity => ({ id, activityType, userId: "sales1", employeeCode: "SE-001", employeeName: "Rafiq Ahmed", source: "MANUAL", occurredAt: "2026-08-27T09:00:00.000Z", submittedAt: "2026-08-27T09:05:00.000Z", verification: "MANUAL", createdByUserId: "sales1" });
  const rows = [activity("visit", "DOCTOR_MEETING"), activity("sale", "ORDER_RECEIVED"), activity("follow", "SERVICE_FOLLOW_UP")];
  assert.deepEqual(filterEmployeeReportActivities(rows, "Field Work").map((row) => row.id), ["visit"]);
  assert.deepEqual(filterEmployeeReportActivities(rows, "Sales & Collection").map((row) => row.id), ["sale"]);
  assert.deepEqual(filterEmployeeReportActivities(rows, "Follow-ups").map((row) => row.id), ["follow"]);
  assert.equal(filterEmployeeReportActivities(rows, "Complete").length, 3);
});
