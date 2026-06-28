import { test, expect, Page } from "@playwright/test";

const PW = process.env.E2E_PASSWORD;
if (!PW) throw new Error("Set E2E_PASSWORD (the seeded test-org account password) before running.");

const OWNER = "e2e-owner@calltime.test";   // org owner
const MEMBER = "e2e-member@calltime.test";  // plain member (cast on E2E Show)
const LEAD = "e2e-lead@calltime.test";      // org member, but show lead (admin tier) on E2E Show

async function login(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("input[type=password]", PW!);
  await page.click("button[type=submit]");
  await page.waitForURL("**/home", { timeout: 40_000 });
}

// ── Rolodex: owner-only donor data ──────────────────────────────────────────
test("owner SEES the Rolodex", async ({ page }) => {
  await login(page, OWNER);
  await page.goto("/rolodex", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("E2E Donor")).toBeVisible();
});

test("plain member does NOT see the Rolodex", async ({ page }) => {
  await login(page, MEMBER);
  await page.goto("/rolodex", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("E2E Donor")).toHaveCount(0);
});

test("a show LEAD still does NOT see the Rolodex (org-member, not org standing)", async ({ page }) => {
  await login(page, LEAD);
  await page.goto("/rolodex", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("E2E Donor")).toHaveCount(0);
});

// ── Per-show leadership: lead can manage the show, cast cannot ───────────────
test("show LEAD can add Press in Marquee", async ({ page }) => {
  await login(page, LEAD);
  await page.goto("/marquee", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^press/i }).click();
  await expect(page.getByRole("button", { name: /add press/i })).toBeVisible();
});

test("cast member CANNOT add Press in Marquee", async ({ page }) => {
  await login(page, MEMBER);
  await page.goto("/marquee", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^press/i }).click();
  await expect(page.getByRole("button", { name: /add press/i })).toHaveCount(0);
});

// ── Availability page renders (Phase 0 surface) ─────────────────────────────
test("availability page loads", async ({ page }) => {
  await login(page, MEMBER);
  await page.goto("/availability", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/my conflicts/i)).toBeVisible();
});
