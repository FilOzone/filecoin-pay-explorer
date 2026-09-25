import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Default: fake Privy (e2e/fake-privy.tsx). E2E_PRIVY=real logs in to the staging Privy app, where test
// accounts are enabled; its IDs and test creds come from .env.e2e.local.
process.env.E2E_PRIVY = process.env.E2E_PRIVY === "real" ? "real" : "mock";
const E2E_ENV = path.join(__dirname, ".env.e2e.local");
if (process.env.E2E_PRIVY === "real" && existsSync(E2E_ENV)) process.loadEnvFile(E2E_ENV);

// Any free port, except against real Privy: the staging app only allows http://localhost:3000 as an origin.
const DEV_PORT = process.env.E2E_PRIVY === "real" ? 3000 : 0;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  use: {
    // Set in workers from the port `next dev` reports; see webServer.wait.
    baseURL: `http://localhost:${process.env.E2E_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next dev --port ${DEV_PORT}`,
    wait: { stdout: /Local:\s+http:\/\/localhost:(?<e2e_port>\d+)/ },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
