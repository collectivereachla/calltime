import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://checkcalltime.art",
    headless: true,
    actionTimeout: 20_000,
    navigationTimeout: 40_000,
    // never wait on networkidle — Calltime holds a realtime socket open
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
