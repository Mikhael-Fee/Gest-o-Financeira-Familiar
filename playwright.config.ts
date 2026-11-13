import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev -- --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run preview -- --port 5174",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev -- --port 5175 --strictPort",
      url: "http://127.0.0.1:5175",
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_URL: "http://127.0.0.1:54320",
        VITE_SUPABASE_ANON_KEY:
          "synthetic-public-key-for-intercepted-tests-only",
      },
    },
  ],
  projects: [
    {
      name: "pwa",
      testMatch: "**/pwa.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5174" },
    },
    {
      name: "desktop",
      testIgnore: ["**/pwa.spec.ts", "**/auth.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testIgnore: ["**/pwa.spec.ts", "**/auth.spec.ts"],
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "auth-desktop",
      testMatch: "**/auth.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5175" },
    },
    {
      name: "auth-mobile",
      testMatch: "**/auth.spec.ts",
      use: { ...devices["Pixel 7"], baseURL: "http://127.0.0.1:5175" },
    },
  ],
});
