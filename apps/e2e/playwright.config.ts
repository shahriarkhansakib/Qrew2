import * as path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

/**
 * Load environment variables.
 * In CI, we usually inject these directly, but locally we can load the root or db .env
 */
dotenv.config({ path: path.resolve(__dirname, "../../packages/db/.env") });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:5002",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    // Custom test id attribute for data-testid
    testIdAttribute: "data-testid",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // We can add Firefox/Webkit later if needed, but Chromium is fine for now
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    // Run the entire monorepo via turbo
    command: "cd ../.. && pnpm dev",
    url: "http://localhost:5002",
    reuseExistingServer: !process.env.CI,
    // Give the turborepo and DB time to boot
    timeout: 120 * 1000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
