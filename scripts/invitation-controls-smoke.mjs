import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const origin = "http://localhost:5178";
const user = { id: "ui-test-admin", name: "Invitation Review", email: "ui@example.invalid", role: "Super Admin", status: "Active", title: "Administrator", department: "Administration", phone: "", avatarUrl: "", capabilities: [], permissionOverrides: [] };
const token = `test.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
const session = { token, user, security: { assurance: "aal2", enrolled: true, required: true } };
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  await mkdir("artifacts/backend/invitation-controls", { recursive: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    try {
      let removed = false;
      let row = { id: "77612014-0000-4000-8000-000000000001", employeeId: "ui-test-employee", employeeName: "New Marketing Employee", employeeStatus: "Pending", state: "Sent", canCancel: true, canDelete: false, attempts: 1, nextAttemptAt: "2026-11-02T06:00:00.000Z", lastCode: "PROVIDER_ACCEPTED", sentAt: "2026-11-02T06:00:00.000Z", updatedAt: "2026-11-02T06:00:00.000Z" };
      const mutations = [];
      await context.addInitScript((session) => localStorage.setItem("mipro-erp-session", JSON.stringify(session)), session);
      await context.route((url) => url.origin === origin && url.pathname.startsWith("/api/"), async (route) => {
        const request = route.request(); const path = new URL(request.url()).pathname;
        let data;
        if (path === "/api/me") data = session;
        else if (path === "/api/settings/invitations") data = { rows: removed ? [] : [row], total: removed ? 0 : 1, page: 1, pageSize: 25 };
        else if (path === "/api/workforce/employees") data = { rows: removed ? [] : [{ id: row.employeeId, name: row.employeeName, employeeCode: "UI-001", title: "Marketing Executive", department: "Sales", territory: "North", phone: "", role: "Sales Executive", status: row.employeeStatus, managerId: null, managerName: "Unassigned", version: 1, avatarId: null }], total: removed ? 0 : 1, page: 1, pageSize: 25 };
        else if (path.startsWith(`/api/settings/invitations/${row.id}`)) {
          const body = request.postDataJSON();
          assert.deepEqual(Object.keys(body), ["updatedAt"]); assert.equal(body.updatedAt, row.updatedAt);
          mutations.push(request.method());
          if (request.method() === "POST" && path.endsWith("/cancel")) row = { ...row, state: "Cancelled", employeeStatus: "Inactive", canCancel: false, canDelete: true, lastCode: "CANCELLED_BY_ADMIN", updatedAt: "2026-11-02T06:01:00.000Z" };
          else { assert.equal(request.method(), "DELETE"); assert.equal(row.state, "Cancelled"); removed = true; }
          data = { id: row.id };
        } else throw new Error(`Unexpected API request: ${path}`);
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, data, message: "Invitation updated" }) });
      });
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${origin}/backend/employees/invitations`);
      await page.getByRole("heading", { name: "Invitation Delivery", exact: true }).waitFor();
      const cancel = page.getByRole("button", { name: "Cancel invitation", exact: true });
      await cancel.waitFor();
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1), true);
      await page.screenshot({ path: `artifacts/backend/invitation-controls/queue-${width}.png`, fullPage: true });
      await cancel.click();
      let dialog = page.getByRole("dialog", { name: "Cancel Invitation", exact: true });
      await dialog.waitFor(); assert.equal(await dialog.locator("input, textarea").count(), 0);
      await dialog.getByRole("button", { name: "Keep invitation", exact: true }).click();
      assert.equal(mutations.length, 0);
      await cancel.click();
      dialog = page.getByRole("dialog", { name: "Cancel Invitation", exact: true });
      await dialog.getByRole("button", { name: "Cancel invitation", exact: true }).click();
      const remove = page.getByRole("button", { name: "Delete invitation", exact: true });
      await remove.waitFor();
      await page.getByRole("button", { name: "Employees", exact: true }).click();
      await page.getByText(row.employeeName, { exact: true }).first().waitFor();
      await page.goto(`${origin}/backend/employees/invitations`);
      await remove.waitFor(); await remove.click();
      dialog = page.getByRole("dialog", { name: "Delete Invitation", exact: true });
      assert.equal(await dialog.locator("input, textarea").count(), 0);
      await page.screenshot({ path: `artifacts/backend/invitation-controls/delete-${width}.png`, fullPage: true });
      await dialog.getByRole("button", { name: "Delete invitation", exact: true }).click();
      await page.getByText("No invitations match this status.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Employees", exact: true }).click();
      await page.getByText("No employees match this search.", { exact: true }).waitFor();
      assert.equal(await page.getByText(row.employeeName, { exact: true }).count(), 0);
      assert.deepEqual(mutations, ["POST", "DELETE"]); assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1), true);
      console.log(`PASS: ${width}px invitation confirmation/cancel/delete and employee-directory removal, no reason field, no overflow; intercepted API fixtures only.`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
