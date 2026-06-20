import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: {
      NEXT_PUBLIC_ADMIRA_ANALYTICS_DEBUG: "true",
      NEXT_PUBLIC_ADMIRA_USE_LOCAL_SCHOOL_FIXTURE: "true",
      NEXT_PUBLIC_SUPABASE_URL: "https://admira-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "admira-anon-test-key",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:3100",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
