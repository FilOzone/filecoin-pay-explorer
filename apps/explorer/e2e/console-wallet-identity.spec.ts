import type { Page } from "@playwright/test";
import { consoleLink, filecoinPin } from "./filecoin-pin";
import { expect, test } from "./fixtures";
import { loginWithTestAccount, logoutFromConsole } from "./privy";

// Regression coverage for the console account: identity switches must not get stuck on "Preparing your wallet",
// and an extension account switch moves the console to the extension's new account.

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
  await expect(page.getByRole("button", { name: "Continue with a Filecoin Pay wallet" })).toBeVisible();

  await loginWithTestAccount(page, { email: "second@fake-privy.test" });
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
});

test("logging out and back in with the same identity reconnects without getting stuck", async ({ page }) => {
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await loginWithTestAccount(page, { email: "repeat@fake-privy.test" });
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });

  await logoutFromConsole(page);
  await expect(page.getByRole("button", { name: "Continue with a Filecoin Pay wallet" })).toBeVisible();

  await loginWithTestAccount(page, { email: "repeat@fake-privy.test" });
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
});

// Fake Privy only: the fake extension switches its selected account on this event, as MetaMask does.
async function switchExtensionAccount(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("fake-privy:switch-account")));
}

const walletMenu = (page: Page) => page.locator('[data-slot="dropdown-menu-trigger"]:not([aria-label])');
const consoleAccount = async (page: Page) => (await walletMenu(page).locator(".font-mono").textContent()) ?? "";

test("an extension account switch while idle moves the console to the new account", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await page.getByRole("button", { name: "Connect existing wallet" }).click();
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  const first = await consoleAccount(page);

  await switchExtensionAccount(page);

  await expect.poll(() => consoleAccount(page)).not.toBe(first);
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible();
  await expect(page.getByText(/^Switched to /)).toBeVisible();
});

test("an email user's console stays on their own wallet when an extension connects and switches", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await loginWithTestAccount(page);
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  const own = await consoleAccount(page);

  await page.evaluate(() => window.dispatchEvent(new Event("fake-privy:connect-extension")));
  await switchExtensionAccount(page);

  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible();
  expect(await consoleAccount(page)).toBe(own);
});

test("an account switch closes a form opened for the previous account", async ({ page, baseURL }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  const cli = await filecoinPin(`${baseURL}`);
  const link = consoleLink(await cli.run("login", "--no-browser", "--no-wait"), `${baseURL}`);
  await stubAccountBackgroundRequests(page);
  await page.goto(link);
  await page.getByRole("button", { name: "Connect existing wallet" }).click();
  await page.getByRole("button", { name: "Review & authorize" }).click();
  const first = await consoleAccount(page);
  const [start] = first.split("...");
  await expect(page.getByRole("button", { name: new RegExp(`^Authorize as ${start}`, "i") })).toBeVisible();

  await switchExtensionAccount(page);

  await expect.poll(() => consoleAccount(page)).not.toBe(first);
  await expect(page.getByRole("button", { name: /^Authorize as / })).toBeHidden();
});

async function connectAndOpenCardPurchase(page: Page): Promise<string> {
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await page.getByRole("button", { name: "Connect existing wallet" }).click();
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  const account = await consoleAccount(page);
  await walletMenu(page).click();
  await page.getByRole("menuitem", { name: "Add funds" }).click();
  await page.getByRole("button", { name: "Verify wallet to buy USDC with card" }).click();
  return account;
}

test("verifying a connected wallet for card purchases signs in as that wallet and buys for it", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  const account = await connectAndOpenCardPurchase(page);

  await page.getByRole("dialog", { name: "signature request" }).getByRole("button", { name: "Sign" }).click();

  const purchase = page.getByRole("dialog", { name: "buy usdc" });
  const [start, end] = account.split("...");
  await expect(purchase).toContainText(start);
  await expect(purchase).toContainText(end);
  await purchase.getByRole("button", { name: "close modal" }).click();
  await expect(page.getByRole("button", { name: "Buy USDC with card", exact: true })).toBeEnabled();
});

test("an extension switch during card verification never opens a purchase for either account", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  const first = await connectAndOpenCardPurchase(page);

  await switchExtensionAccount(page);
  await page.getByRole("dialog", { name: "signature request" }).getByRole("button", { name: "Sign" }).click();

  await expect.poll(() => consoleAccount(page)).not.toBe(first);
  await expect(page.getByRole("dialog", { name: "buy usdc" })).toBeHidden();
});

test("rejecting the wallet's sign-in leaves card purchases unverified", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  await connectAndOpenCardPurchase(page);

  await page.getByRole("dialog", { name: "signature request" }).getByRole("button", { name: "Reject" }).click();

  await expect(page.getByRole("button", { name: "Verify wallet to buy USDC with card" })).toBeEnabled();
  await expect(page.getByRole("dialog", { name: "buy usdc" })).toBeHidden();
});

test("after a switch, the extension's new account verifies for itself before buying by card", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  const first = await connectAndOpenCardPurchase(page);
  await page.getByRole("dialog", { name: "signature request" }).getByRole("button", { name: "Sign" }).click();
  await page.getByRole("dialog", { name: "buy usdc" }).getByRole("button", { name: "close modal" }).click();

  await switchExtensionAccount(page);
  await expect.poll(() => consoleAccount(page)).not.toBe(first);
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible();
  const newAccount = await consoleAccount(page);
  await walletMenu(page).click();
  await page.getByRole("menuitem", { name: "Add funds" }).click();

  // The previous account's login does not carry over to the new one.
  await page.getByRole("button", { name: "Verify wallet to buy USDC with card" }).click();
  await page.getByRole("dialog", { name: "signature request" }).getByRole("button", { name: "Sign" }).click();
  const [start, end] = newAccount.split("...");
  await expect(page.getByRole("dialog", { name: "buy usdc" })).toContainText(start);
  await expect(page.getByRole("dialog", { name: "buy usdc" })).toContainText(end);
});

test("an email account opens the card purchase without another sign-in", async ({ page }) => {
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await loginWithTestAccount(page);
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  const account = await consoleAccount(page);
  await walletMenu(page).click();
  await page.getByRole("menuitem", { name: "Add funds" }).click();

  await page.getByRole("button", { name: "Buy USDC with card", exact: true }).click();

  test.skip(process.env.E2E_MODE === "real", "the fake's card purchase window shows the destination");
  await expect(page.getByRole("dialog", { name: "signature request" })).toBeHidden();
  const [start, end] = account.split("...");
  await expect(page.getByRole("dialog", { name: "buy usdc" })).toContainText(start);
  await expect(page.getByRole("dialog", { name: "buy usdc" })).toContainText(end);
});

test("after the site's access is revoked, Disconnect leaves the console", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await page.getByRole("button", { name: "Connect existing wallet" }).click();
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => window.dispatchEvent(new Event("fake-privy:revoke-extension")));
  await expect(page.getByRole("heading", { name: "Reconnect your wallet" })).toBeVisible();
  await page.getByRole("button", { name: "Disconnect" }).click();

  await expect(page.getByRole("button", { name: "Connect existing wallet" })).toBeVisible();
});

test("on an unsupported network, the exit leaves the console", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await page.getByRole("button", { name: "Connect existing wallet" }).click();
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });

  // Gnosis: neither a console network nor a Squid source chain.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("fake-privy:switch-chain", { detail: 100 })));
  await expect(page.getByRole("heading", { name: "Unsupported Network" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();

  await expect(page.getByRole("button", { name: "Connect existing wallet" })).toBeVisible();
});
