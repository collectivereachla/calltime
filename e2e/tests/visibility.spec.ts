import { test, expect, Page } from "@playwright/test";

const PW = process.env.E2E_PASSWORD;
if (!PW) throw new Error("Set E2E_PASSWORD (the seeded test-org account password) before running.");
const OWNER = "e2e-owner@calltime.test";
const MEMBER = "e2e-member@calltime.test";

async function login(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("input[type=password]", PW);
  await page.click("button[type=submit]");
  await page.waitForURL("**/home", { timeout: 40_000 });
}

test("owner can log in and reach Home", async ({ page }) => {
  await login(page, OWNER);
  await expect(page).toHaveURL(/\/home/);
});

test("owner sees the Rolodex (E2E Donor)", async ({ page }) => {
  await login(page, OWNER);
  await page.goto("/rolodex", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("E2E Donor")).toBeVisible();
});

test("member is denied the Rolodex (no donor data)", async ({ page }) => {
  await login(page, MEMBER);
  await page.goto("/rolodex", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("E2E Donor")).toHaveCount(0);
});
