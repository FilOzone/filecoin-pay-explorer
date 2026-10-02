import type { Page } from "@playwright/test";
import { consoleLink, filecoinPin } from "./filecoin-pin";
import { expect, test } from "./fixtures";
import { loginWithTestAccount, stubAccountBackgroundRequests } from "./privy";

// The console account follows the wallet while idle, stays on an email user's own wallet when another wallet
// connects, and never acts for an account other than the one an action started with.

test.skip(process.env.E2E_MODE === "real", "needs the fake extension");

const walletMenu = (page: Page) => page.locator('[data-slot="dropdown-menu-trigger"]:not([aria-label])');
const consoleAccount = async (page: Page) => (await walletMenu(page).locator(".font-mono").textContent()) ?? "";
const fire = (page: Page, event: string) => page.evaluate((name) => window.dispatchEvent(new Event(name)), event);

async function connectExtension(page: Page): Promise<string> {
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await page.getByRole("button", { name: "Connect a wallet without an account" }).click();
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  return consoleAccount(page);
}

test("a wallet reaches the console without a Privy login", async ({ page }) => {
  await connectExtension(page);
  await walletMenu(page).click();
  await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log in to buy USDC with card" })).toBeHidden();
});

test("an extension account switch while idle moves the console to the new account", async ({ page }) => {
  const first = await connectExtension(page);

  await fire(page, "fake-privy:switch-account");

  await expect.poll(() => consoleAccount(page)).not.toBe(first);
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible();
  await expect(page.getByText("Wallet account changed")).toBeHidden();
});

test("an email user's console stays on their own wallet when an extension connects", async ({ page }) => {
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await loginWithTestAccount(page);
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  const own = await consoleAccount(page);

  await fire(page, "fake-privy:connect-extension");
  await fire(page, "fake-privy:switch-account");

  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible();
  expect(await consoleAccount(page)).toBe(own);
});

async function startCardLogin(page: Page): Promise<string> {
  const account = await connectExtension(page);
  await walletMenu(page).click();
  await page.getByRole("menuitem", { name: "Add funds" }).click();
  await page.getByRole("button", { name: "Log in to buy USDC with card" }).click();
  return account;
}

test("a wallet user signs in with that wallet and the card purchase opens for it", async ({ page }) => {
  const account = await startCardLogin(page);

  await page.getByRole("dialog", { name: "signature request" }).getByRole("button", { name: "Sign" }).click();

  const purchase = page.getByRole("dialog", { name: "buy usdc" });
  const [start, end] = account.split("...");
  await expect(purchase).toContainText(start);
  await expect(purchase).toContainText(end);
});

test("an extension switch during card sign-in never opens a purchase for either account", async ({ page }) => {
  const first = await startCardLogin(page);

  await fire(page, "fake-privy:switch-account");
  await page.getByRole("dialog", { name: "signature request" }).getByRole("button", { name: "Sign" }).click();

  await expect.poll(() => consoleAccount(page)).not.toBe(first);
  await expect(page.getByRole("dialog", { name: "buy usdc" })).toBeHidden();
});

test("after a switch, the new account signs in for itself before buying by card", async ({ page }) => {
  const first = await startCardLogin(page);
  await page.getByRole("dialog", { name: "signature request" }).getByRole("button", { name: "Sign" }).click();
  await page.getByRole("dialog", { name: "buy usdc" }).getByRole("button", { name: "close modal" }).click();

  await fire(page, "fake-privy:switch-account");
  await expect.poll(() => consoleAccount(page)).not.toBe(first);
  await walletMenu(page).click();
  await page.getByRole("menuitem", { name: "Add funds" }).click();

  await page.getByRole("button", { name: "Log in to buy USDC with card" }).click();
  await page.getByRole("dialog", { name: "signature request" }).getByRole("button", { name: "Sign" }).click();

  const [start, end] = (await consoleAccount(page)).split("...");
  const purchase = page.getByRole("dialog", { name: "buy usdc" });
  await expect(purchase).toContainText(start);
  await expect(purchase).toContainText(end);
});

test("a wallet user who signed in for card purchases leaves the console on Log out", async ({ page }) => {
  await startCardLogin(page);
  await page.getByRole("dialog", { name: "signature request" }).getByRole("button", { name: "Sign" }).click();
  await page.getByRole("dialog", { name: "buy usdc" }).getByRole("button", { name: "close modal" }).click();
  await page.keyboard.press("Escape");

  await walletMenu(page).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();

  await expect(page.getByRole("button", { name: "Connect a wallet without an account" })).toBeVisible();
});

test("an account switch closes a form opened for the previous account", async ({ page, baseURL }) => {
  const cli = await filecoinPin(`${baseURL}`);
  const link = consoleLink(await cli.run("login", "--no-browser", "--no-wait"), `${baseURL}`);
  await stubAccountBackgroundRequests(page);
  await page.goto(link);
  await page.getByRole("button", { name: "Connect a wallet without an account" }).click();
  await page.getByRole("button", { name: "Review & authorize" }).click();
  const first = await consoleAccount(page);
  const [start] = first.split("...");
  await expect(page.getByRole("button", { name: new RegExp(`^Authorize as ${start}`, "i") })).toBeVisible();

  await fire(page, "fake-privy:switch-account");

  await expect.poll(() => consoleAccount(page)).not.toBe(first);
  await expect(page.getByRole("button", { name: /^Authorize as / })).toBeHidden();
});
