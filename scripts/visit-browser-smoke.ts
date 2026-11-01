import { openWorkspace, signOutWorkspace } from "./workspace-browser.js";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect as baseExpect } from "@playwright/test";
import { createServer } from "vite";
import sharp from "sharp";
import { businessDate } from "../src/lib/date.js";

const expect = baseExpect.configure({ timeout: 30000 });
export async function visitBrowserSmoke(apiBase: string, managerEmail: string, salesEmail: string, password: string, customerId: string, employeeId: string) {
  process.env.VITE_BACKEND_MODE = "foundation"; process.env.VITE_DEMO_MODE = "false";
  const web = await createServer({ cacheDir: "node_modules/.vite-visit-test", server: { port: 5197, host: "localhost", strictPort: true, proxy: { "/api": { target: new URL(apiBase).origin, changeOrigin: true } } } });
  await mkdir("artifacts/backend",{recursive:true});
  const cameraFile=resolve("artifacts/backend/visit-test-camera.y4m");
  const frame=Buffer.concat([Buffer.alloc(640*480,120),Buffer.alloc(320*240,90),Buffer.alloc(320*240,160)]);
  await writeFile(cameraFile,Buffer.concat([Buffer.from("YUV4MPEG2 W640 H480 F30:1 Ip A1:1 C420jpeg\nFRAME\n"),frame,Buffer.from("FRAME\n"),frame]));
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",`--use-file-for-fake-video-capture=${cameraFile}`] });
  try {
    await web.listen(); await mkdir("artifacts/backend", { recursive: true });
    const photo = await sharp({ create: { width: 1280, height: 960, channels: 3, background: "#0891b2" } }).jpeg().toBuffer();
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, geolocation: { latitude: 23.8103, longitude: 90.4125, accuracy: 12 }, permissions: ["geolocation", "camera"] });
      const page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(90000);
      const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (r) => { const path = new URL(r.url()).pathname; if (path.startsWith("/api/") && r.status() >= 400) errors.push(`${r.status()} ${path}`); });
      const capture = async (label: string) => { assert.deepEqual(errors, [], `${label}: no API/browser errors`); assert.ok(await page.locator("body").evaluate((b) => b.scrollWidth <= b.clientWidth + 2), `${label}: page fits ${width}px`); await page.screenshot({ path: `artifacts/backend/visit-${label}-${width}.png`, fullPage: true }); };
      const login = async (email: string) => { await page.goto("http://localhost:5197/login", { waitUntil: "networkidle" }); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign In", exact: true }).click(); await page.waitForURL("**/backend"); };
      const fieldDay = async () => { await openWorkspace(page, "Sales & Marketing"); await page.getByTestId("persistent-marketing").waitFor(); await page.getByRole("tab", { name: "My Field Day / Visits", exact: true }).click(); await expect(page.getByText("Loading saved visits", { exact: true })).toHaveCount(0); };
      await login(salesEmail); await fieldDay(); await capture("own-history");
      await page.getByRole("button", { name: "Check In", exact: true }).click(); await page.getByLabel("Check-in contact", { exact: true }).selectOption(`customer:${customerId}`); await page.getByLabel("Visit purpose", { exact: true }).fill(`DEV TEST browser check-in ${width}`); await page.getByRole("button", { name: "Prepare Check-in", exact: true }).click(); await expect(page.getByRole("button", { name: "Open Camera", exact: true })).toBeVisible();
      if (width === 1440) {
        await page.getByRole("button", { name: "Open Camera", exact: true }).click(); await expect(page.locator("video")).toBeVisible(); await expect.poll(() => page.locator("video").evaluate((v) => (v as unknown as { videoWidth: number }).videoWidth)).toBeGreaterThanOrEqual(16); await page.getByRole("button", { name: "Take Photo", exact: true }).click();
      } else {
        await page.getByLabel("Choose visit photo", { exact: true }).setInputFiles({ name: "DEV-TEST-evidence.jpg", mimeType: "image/jpeg", buffer: photo });
      }
      await expect(page.getByAltText("Visit evidence preview")).toBeVisible(); await page.getByRole("button", { name: "Check Location", exact: true }).click(); await expect(page.getByTestId("field-visit-checkin")).toContainText("accuracy about 12 m"); await capture("capture");
      const submitted: string[] = [];
      if (width === 390) await page.route("**/api/workforce/visits/check-ins", async (route) => { submitted.push(route.request().postData()!); const response = await route.fetch(); if (submitted.length === 1) { assert.equal(response.status(), 201); await route.abort("failed"); } else await route.fulfill({ response }); });
      await page.getByRole("button", { name: "Save Check-in", exact: true }).click();
      if (width === 390) { await page.getByRole("button", { name: "Retry Saved Submission", exact: true }).click(); assert.equal(submitted.length, 2); assert.equal(submitted[0], submitted[1], "Lost-response retry retains the exact original capture"); }
      const detail = page.getByTestId("field-visit-detail"); await expect(detail).toContainText(`DEV TEST browser check-in ${width}`); await expect(detail.getByRole("button", { name: "Complete Visit", exact: true })).toBeVisible(); await capture("saved");
      assert.equal(await page.locator(".leaflet-container").count(), 0, "No external map loads until requested");
      await page.getByRole("button", { name: "Show Map", exact: true }).click(); await page.getByTestId("recorded-visit-map").waitFor(); await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2); await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible(); await capture("recorded-map");
      await page.getByRole("button", { name: "Complete Visit", exact: true }).click(); await page.getByLabel("Visit Outcome", { exact: true }).fill(`DEV TEST browser outcome ${width}`); await page.getByRole("button", { name: "Confirm", exact: true }).click(); await expect(detail).toContainText(`DEV TEST browser outcome ${width}`); await expect(detail.getByRole("button", { name: "Complete Visit", exact: true })).toHaveCount(0); await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByLabel("Search visits", { exact: true }).fill(`browser check-in ${width}`); await expect(page.getByTestId("persistent-field-visits")).toContainText(`DEV TEST browser check-in ${width}`); await capture("search");
      await signOutWorkspace(page); await login(managerEmail);
      await page.goto(`http://localhost:5197/backend/employees?view=activity&employee=${employeeId}`, { waitUntil: "domcontentloaded" }); await page.getByRole("tab", { name: "My Field Day / Visits", exact: true }).click(); await page.getByLabel("Search visits", { exact: true }).fill(`browser check-in ${width}`); const open = page.getByRole("button", { name: /^Open visit VIS-/ }).first(); await expect(open).toBeVisible(); await open.click(); await expect(detail).toContainText(`DEV TEST browser check-in ${width}`);
      await page.getByRole("button", { name: "Accept for Review", exact: true }).click(); await page.getByLabel("Reason", { exact: true }).fill("DEV TEST manager browser review"); await page.getByRole("button", { name: "Confirm", exact: true }).click(); await expect(detail).toContainText("Review: Accepted"); await capture("manager-review"); await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.goto(`http://localhost:5197/backend/reports/visit-verification?from=${businessDate()}&to=${businessDate()}&employee=${employeeId}`, { waitUntil: "domcontentloaded" }); await expect(page.getByRole("button", { name: "Print Preview", exact: true })).toBeEnabled(); await capture("report"); await page.getByRole("button", { name: "Print Preview", exact: true }).click();
      const print = page.getByRole("button", { name: "Print / Save PDF", exact: true }); await expect(print).toBeEnabled();
      for (const mode of ["With Background", "Without Background"]) { await page.getByRole("tab", { name: mode, exact: true }).click(); await expect(print).toBeEnabled(); await expect(page.locator(".print-sheet").first().locator("[data-persistent-report-table] thead th")).toHaveCount(6); await capture(mode === "With Background" ? "digital" : "preprinted"); await page.emulateMedia({ media: "print" }); const bounds = await page.locator(".print-sheet").first().evaluate((el) => ({ height: el.getBoundingClientRect().height, scroll: el.scrollHeight })); assert.ok(bounds.scroll <= bounds.height + 2); if (width === 1440) await page.pdf({ path: `artifacts/backend/visit-${mode === "With Background" ? "digital" : "preprinted"}.pdf`, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false }); await page.emulateMedia({ media: "screen" }); }
      await context.close(); console.log(`Field-visit UI passed at ${width}px: photo, location, save, map, completion, review, search and print.`);
    }
  } catch (error) { for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: "artifacts/backend/visit-failed.png", fullPage: true }).catch(() => undefined); throw error; }
  finally { await browser.close(); if (web.httpServer && "closeAllConnections" in web.httpServer) web.httpServer.closeAllConnections(); await web.close(); }
}
