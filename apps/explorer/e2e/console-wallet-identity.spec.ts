import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { loginWithTestAccount, logoutFromConsole } from "./privy";

// Regression coverage for the console getting stuck on "Preparing your wallet" after logging out of
// one identity and into another: a race between Privy's embedded-wallet reconnect and its own
// connector-registration effect, both real @privy-io/wagmi code that runs under the fake Privy here.

// A fresh e2e wallet has no subgraph or notification history; without these, the console's own
// background polls for it are just slow requests the test can outlast, and `fixtures.ts` fails any
// test that leaves one still in flight when it ends. These give an empty-but-valid answer instead.
async function stubAccountBackgroundRequests(page: Page): Promise<void> {
  await page.route(
    (url) => url.hostname === "api.goldsky.com",
    (route) => {
      const query = route.request().postData() ?? "";
      const data = query.includes("GetAccountTokens") ? { userTokens: [] } : { accounts: [] };
      return route.fulfill({ json: { data } });
    },
  );
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );
}

test("logging in with a different identity after logout reaches the console, not stuck preparing", async ({ page }) => {
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await loginWithTestAccount(page, { email: "first@fake-privy.test" });
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });

  await logoutFromConsole(page);
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();

  await loginWithTestAccount(page, { email: "second@fake-privy.test" });
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
});

test("logging out and back in with the same identity reconnects without getting stuck", async ({ page }) => {
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await loginWithTestAccount(page, { email: "repeat@fake-privy.test" });
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });

  await logoutFromConsole(page);
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();

  await loginWithTestAccount(page, { email: "repeat@fake-privy.test" });
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
});
