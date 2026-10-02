import { expect, test } from "./fixtures";
import { loginWithTestAccount, logoutFromConsole, stubAccountBackgroundRequests } from "./privy";

// Regression coverage for the console getting stuck on "Preparing your wallet" after switching identities.

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
