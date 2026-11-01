import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { build, preview } from "vite";
import { chromium, type Page } from "@playwright/test";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { documents } from "../database/schema.js";
import { D } from "../server/trading/money.js";
import type { hostedHarness } from "../server/testing/hosted.js";
import { signOutWorkspace } from "./workspace-browser.js";

export async function prepareStockControlBrowserBundle() {
  process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false"; const nodeEnv = process.env.NODE_ENV;
  try { await build({ logLevel: "warn", build: { outDir: "artifacts/backend/stock-control-build", emptyOutDir: true } }); }
  finally { if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv; }
}
export async function checkStockControlBrowser(h: Awaited<ReturnType<typeof hostedHarness>>, people: { email: string; token: string }[], batchId: string, qualityObjects: string[] = []) {
  const origin = "http://localhost:5193";
  const web = await preview({ logLevel: "warn", build: { outDir: "artifacts/backend/stock-control-build" }, preview: { host: "localhost", port: 5193, strictPort: true, proxy: { "/api": { target: new URL(h.bases[0]).origin, changeOrigin: true } } } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const loginTokens = new Map<Page, string>();
  const posted = async (page: Page, path: string, action: () => Promise<unknown>) => {
    const pending = page.waitForResponse((r) => new URL(r.url()).pathname === `/api${path}` && r.request().method() === "POST"); await action(); const response = await pending; const body = await response.json(); assert.ok(response.ok(), `${path}: ${body.message}`); return body.data;
  };
  const login = async (page: Page, index: number) => {
    await page.goto(`${origin}/login`); await page.getByLabel("Email", { exact: true }).fill(people[index].email); await page.getByLabel("Password", { exact: true }).fill(h.password); const session = await posted(page, "/auth/login", () => page.getByRole("button", { name: "Sign In", exact: true }).click()); loginTokens.set(page, session.token); await page.waitForURL("**/backend");
  };
  const logout = async (page: Page) => {
    const token = loginTokens.get(page); assert.ok(token); await signOutWorkspace(page); await page.waitForURL("**/login");
    for (let attempt = 0; attempt < 20; attempt++) {
      if ((await h.call("/me", token)).status === 401) { loginTokens.delete(page); return; }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    assert.fail("Browser logout must revoke its real API session, not only navigate to login");
  };
  try {
    await mkdir("artifacts/backend/stock-controls", { recursive: true });
    for (const [name, width] of [["desktop", 1440], ["mobile", 390]] as const) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(45000); const faults: string[] = [];
      page.on("pageerror", (e) => faults.push(e.name)); page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) faults.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      const capture = async (label: string) => { await page.waitForLoadState("networkidle"); for (const selector of ["html", "body"]) assert.ok(await page.locator(selector).evaluate((el) => el.scrollWidth <= el.clientWidth + 2), `${label}: ${selector} fits ${width}px`); await page.screenshot({ path: `artifacts/backend/stock-controls/${label}-${name}.png`, fullPage: true }); };
      try {
        const batches = await h.expect(`/inventory/batches/page?batchId=${batchId}`, people[0].token); const batch = batches.rows[0]; const quantity = new D(batch.quantityAvailable).div(2).toFixed(4);
        await login(page, 0); await page.goto(`${origin}/backend/inventory/controls`); await page.getByRole("heading", { name: "Stock Counts & Write-offs", exact: true }).waitFor(); await capture("register");
        await page.goto(`${origin}/backend/inventory/controls/new?kind=Physical%20Count&batch=${batchId}`); await page.getByRole("heading", { name: "New Physical Count", exact: true }).waitFor();
        await page.getByLabel(`Counted quantity ${batch.batchNumber}`, { exact: true }).fill(quantity); await page.getByLabel("Evidence reference", { exact: true }).fill(`DEV TEST ${name} signed recount`); await page.getByLabel("Investigation / reason", { exact: true }).fill(`DEV TEST ${name} counted shortage investigation`); await page.getByLabel("Inspection findings", { exact: true }).fill(`DEV TEST ${name} independently observed remaining stock`); await capture("count-editor");
        const source = await posted(page, "/inventory/controls", () => page.getByRole("button", { name: "Save Draft", exact: true }).click()); await page.waitForURL(`**/controls/${source.id}`);
        await page.getByRole("button",{name:"Attach File",exact:true}).waitFor();
        const photograph=await sharp({create:{width:240,height:160,channels:3,background:"#bae6fd"}}).png().toBuffer();
        const authorized=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/quality-evidence/Stock%20Control/${source.id}/uploads`&&r.request().method()==="POST");
        const complete=page.waitForResponse(r=>new URL(r.url()).pathname.startsWith("/api/quality-evidence/uploads/")&&new URL(r.url()).pathname.endsWith("/complete")&&r.request().method()==="POST");
        await page.getByLabel("Inspection attachment",{exact:true}).setInputFiles({name:`inspection-${name}.png`,mimeType:"image/png",buffer:photograph});
        const authResponse=await authorized;assert.ok(authResponse.ok());const authorization=(await authResponse.json()).data;
        const [document]=await h.ctx.db.select().from(documents).where(eq(documents.id,authorization.id));qualityObjects.push(document.objectPath);
        assert.ok((await complete).ok());
        const evidence=await h.expect(`/quality-evidence/Stock%20Control/${source.id}`,people[0].token);const file=evidence.files[0];assert.ok(file.sha256);
        await page.getByRole("button",{name:`View inspection-${name}.png`,exact:true}).click();await page.getByTestId("document-viewer").getByRole("img").waitFor();
        await page.getByTestId("document-viewer").getByRole("img").evaluate(async el=>{const image=el as unknown as {decode():Promise<void>;naturalWidth:number};await image.decode();if(!image.naturalWidth)throw new Error("Protected evidence preview must decode");});
        await capture("protected-inspection");await page.getByRole("button",{name:"Close document viewer",exact:true}).last().click();
        const request = await posted(page, `/inventory/controls/${source.id}/submit`, () => page.getByRole("button", { name: "Submit for Approval", exact: true }).click()); await page.getByLabel("Evidence frozen",{exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"Attach File",exact:true}).count(),0);await capture("submitted-source"); await logout(page);
        for (const [index, action] of [[1, "verify"], [2, "approve"]] as const) {
          await login(page, index); await page.goto(`${origin}/backend/approvals?domain=Stock`); let row = page.getByRole("row").filter({ hasText: source.number }); await row.getByRole("button", { name: `Open ${source.number}`, exact: true }).click(); await page.waitForURL(`**/controls/${source.id}`); await page.getByRole("heading", { name: source.number, exact: true }).waitFor(); await page.getByRole("heading", { name: "Selected Batch Snapshot", exact: true }).waitFor(); await capture(`${action}-source`);
          await page.goto(`${origin}/backend/approvals?domain=Stock`); row = page.getByRole("row").filter({ hasText: source.number }); await row.getByRole("button", { name: action === "verify" ? "Verify" : "Approve", exact: true }).click(); await page.getByLabel("Decision reason / evidence", { exact: true }).fill(`DEV TEST ${name} independent ${action} of physical count`); await posted(page, `/controls/approvals/${request.approvalId}/${action}`, () => page.getByRole("button", { name: "Confirm", exact: true }).click()); await logout(page);
        }
        await login(page, 0); await page.goto(`${origin}/backend/inventory/controls/${source.id}`); await page.getByRole("button", { name: "Post Approved Control", exact: true }).click(); await posted(page, `/inventory/controls/${source.id}/post`, () => page.getByRole("alertdialog").getByRole("button", { name: "Post Approved Control", exact: true }).click()); await page.getByText("Posted", { exact: true }).first().waitFor(); await capture("posted-source");
        await page.getByRole("button", { name: "Open Report", exact: true }).click(); await page.getByRole("button", { name: "Print Preview", exact: true }).waitFor(); await capture("report"); await page.getByRole("button", { name: "Print Preview", exact: true }).click(); await page.locator(".letterhead-sheet:visible").first().waitFor();
        for (const mode of ["With Background", "Without Background"] as const) { await page.getByRole("tab", { name: mode, exact: true }).click(); await page.screenshot({ path: `artifacts/backend/stock-controls/print-${mode === "With Background" ? "digital" : "preprinted"}-${name}.png`, fullPage: true }); }
        assert.deepEqual(faults, []); await logout(page); await page.close(); console.log(`Stock control browser ${name}: count preparation, independent source review/approval, atomic posting and both official print modes passed.`);
      } catch (error) { await page.screenshot({ path: `artifacts/backend/stock-controls/failure-${name}.png`, fullPage: true }).catch(() => {}); console.error("Stock control browser state", { viewport: name, path: new URL(page.url()).pathname, faults }); throw error; }
    }
  } finally { loginTokens.clear(); await browser.close(); if ("closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections(); await new Promise<void>((resolve) => web.httpServer.close(() => resolve())); }
}
