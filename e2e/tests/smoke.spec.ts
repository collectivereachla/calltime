import { test, expect, Page } from "@playwright/test";

const PW = process.env.E2E_PASSWORD;
if (!PW) throw new Error("Set E2E_PASSWORD (the seeded test-org account password) before running.");

const OWNER = "e2e-owner@calltime.test";
const MEMBER = "e2e-member@calltime.test";

async function login(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("input[type=password]", PW!);
  await page.click("button[type=submit]");
  await page.waitForURL("**/home", { timeout: 40_000 });
}

// ── Smoke: every room renders the authenticated shell (no crash, no kick to /login) ──
// The owner sees all rooms, so this catches render-time crashes app-wide — the
// class of UI bug the TS build + RLS tests can't see.
const OWNER_ROOMS = [
  "/home", "/callboard", "/company", "/greenroom", "/spine", "/run",
  "/booth", "/marquee", "/playbill", "/ledger", "/rolodex", "/seating",
  "/inventory", "/applications", "/archive",
];

for (const path of OWNER_ROOMS) {
  test(`owner: ${path} renders`, async ({ page }) => {
    await login(page, OWNER);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    // Did not get bounced to login…
    await expect(page).not.toHaveURL(/\/login/);
    // …and the app shell mounted (a known nav link is present).
    await expect(page.getByRole("link", { name: /Greenroom/ }).first()).toBeVisible({ timeout: 20_000 });
  });
}

// ── Seating front-of-house gate ─────────────────────────────────────────────
test("owner can open Seating (front-of-house)", async ({ page }) => {
  await login(page, OWNER);
  await page.goto("/seating", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/run by the front-of-house/i)).toHaveCount(0);
});

test("cast member is gated out of Seating", async ({ page }) => {
  await login(page, MEMBER);
  await page.goto("/seating", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/front-of-house|No active production/i).first()).toBeVisible();
});
