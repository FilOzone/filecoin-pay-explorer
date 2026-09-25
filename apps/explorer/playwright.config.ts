import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Default: fake Privy (e2e/fake-privy.tsx). E2E_PRIVY=real logs in to the staging Privy app, where test
// accounts are enabled; its IDs and test creds come from .env.e2e.local.
process.env.E2E_PRIVY = process.env.E2E_PRIVY === "real" ? "real" : "mock";
const E2E_ENV = path.join(__dirname, ".env.e2e.local");
if (process.env.E2E_PRIVY === "real" && existsSync(E2E_ENV)) process.loadEnvFile(E2E_ENV);

const PORT = 3000;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/console`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
