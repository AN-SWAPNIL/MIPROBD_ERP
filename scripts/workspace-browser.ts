import type { Page } from "@playwright/test";
export async function openWorkspace(page: Page, label: string) {
  await page.locator(".app-header").waitFor({ state: "visible", timeout: 30000 });
  if (label === "Profile & Security") {
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("button", { name: "Profile & settings", exact: true }).click(); return;
  }
  const canonical = label === "Sales" ? "Sales & Marketing" : label === "Accounts" ? "Expenses & Accounts" : label;
  const navigation = page.locator("nav:visible");
  if (!await navigation.count()) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.locator("nav:visible").getByRole("link", { name: canonical, exact: true }).click();
}
export async function signOutWorkspace(page: Page) {
  await page.locator(".app-header").waitFor({ state: "visible", timeout: 30000 });
  const button = page.getByRole("button", { name: "Sign out", exact: true }).filter({ visible: true });
  if (!await button.count()) await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).filter({ visible: true }).first().click();
}
