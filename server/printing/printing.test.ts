import test from "node:test";
import assert from "node:assert/strict";
import { printConfigurationInput } from "./contracts.js";

const config = () => ({ version: 1, defaultIdentityId: "mipro", defaultLetterheadMode: "Digital", identities: [{ id: "mipro", companyName: "MIPRO HEALTHCARE CORPORATION", displayName: "MIPRO Healthcare", address: "Uttara, Dhaka", phone: "", email: "office@example.com", website: "www.miprobd.com", logoUrl: "/mipro-logo.png", backgroundImageUrl: "/mipro-letterhead.jpg", footerText: "", authorizedSignatory: "Authorized Signatory", safeArea: { topMm: 39, rightMm: 19, bottomMm: 24, leftMm: 22.5 } }] });

test("stationery accepts bounded A4 calibration and a current version", () => {
  assert.equal(printConfigurationInput.parse(config()).version, 1);
  for (const version of [0, -1, 1.1, undefined]) assert.equal(printConfigurationInput.safeParse({ ...config(), version }).success, false);
});
test("stationery rejects duplicate or missing default identities", () => {
  assert.equal(printConfigurationInput.safeParse({ ...config(), defaultIdentityId: "led-trackers" }).success, false);
  assert.equal(printConfigurationInput.safeParse({ ...config(), identities: [config().identities[0], config().identities[0]] }).success, false);
});
test("stationery rejects remote/traversal artwork and branding overlap", () => {
  for (const backgroundImageUrl of ["https://example.com/track.jpg", "//example.com/x", "/../private", "data:image/png;base64,AAAA"]) assert.equal(printConfigurationInput.safeParse({ ...config(), identities: [{ ...config().identities[0], backgroundImageUrl }] }).success, false);
  for (const [key, limit] of [["leftMm", 22.4], ["topMm", 34.9], ["bottomMm", 19.9], ["rightMm", 4.9], ["topMm", 70]] as const) assert.equal(printConfigurationInput.safeParse({ ...config(), identities: [{ ...config().identities[0], safeArea: { ...config().identities[0].safeArea, [key]: limit } }] }).success, false);
});
