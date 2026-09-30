import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { loginWithTestAccount, logoutFromConsole } from "./privy";

// Regression coverage for the console account: identity switches must not get stuck on "Preparing your wallet",
// and an extension account switch must pause the console instead of following the wallet.

// A fresh e2e wallet has no subgraph or notification history; these stub that empty state.
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

// Fake Privy only: the fake extension switches its selected account on this event, as MetaMask does.
async function switchExtensionAccount(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("fake-privy:switch-account")));
}

test("an extension account switch pauses the console until the wallet switches back", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await page.getByRole("button", { name: "Connect a wallet without an account" }).click();
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });

  await switchExtensionAccount(page);
  await expect(page.getByRole("heading", { name: "Your wallet switched accounts" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeHidden();

  await switchExtensionAccount(page);
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible();
});

test("continuing as the extension's new account opens the console for that account", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await page.getByRole("button", { name: "Connect a wallet without an account" }).click();
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });

  await switchExtensionAccount(page);
  const continueButton = page.getByRole("button", { name: /^Continue as / });
  const newAccount = (await continueButton.textContent())?.replace("Continue as ", "") ?? "";
  await continueButton.click();

  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible();
  await expect(page.getByText(newAccount).first()).toBeVisible();
});
