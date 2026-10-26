import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    actionTimeout: 15000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100/demo",
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DEMO_MODE: "true",
      DEMO_DATA_DIR: `.relaydesk/browser-tests/${Date.now()}`,
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      AI_PROVIDER: "demo",
      REAL_INFERENCE_ENABLED: "false",
      BILLING_PROVIDER: "mock",
    },
  },
});
