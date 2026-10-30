import type { Page } from "@playwright/test";
import type { Hex } from "viem";
import { base } from "viem/chains";
import { SOURCE_RPC_URLS } from "../src/services/wagmi/transports";
import { installFakeSquid } from "./fake-squid";
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
  await expect(page.getByRole("button", { name: "Continue with email or Google" })).toBeVisible();

  await loginWithTestAccount(page, { email: "second@fake-privy.test" });
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
});

test("logging out and back in with the same identity reconnects without getting stuck", async ({ page }) => {
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await loginWithTestAccount(page, { email: "repeat@fake-privy.test" });
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });

  await logoutFromConsole(page);
  await expect(page.getByRole("button", { name: "Continue with email or Google" })).toBeVisible();

  await loginWithTestAccount(page, { email: "repeat@fake-privy.test" });
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
});

// Fake Privy only: the fake extension switches its selected account on this event, as MetaMask does.
async function switchExtensionAccount(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("fake-privy:switch-account")));
}

const walletMenu = (page: Page) => page.locator('[data-slot="dropdown-menu-trigger"]:not([aria-label])');
const openAddFunds = async (page: Page) => {
  await walletMenu(page).click();
  await page.getByRole("menuitem", { name: "Add funds" }).click();
};
const consoleAccount = async (page: Page) => (await walletMenu(page).locator(".font-mono").textContent()) ?? "";

async function openAddFundsFromWalletMenu(page: Page): Promise<void> {
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await page.getByRole("button", { name: "Connect existing wallet" }).click();
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  await openAddFunds(page);
  await expect(page.getByRole("heading", { name: "Add funds" })).toBeVisible();
  // Let the menu finish closing, as a person would.
  await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCount(0);
}

// Role queries skip aria-hidden content, so these fail if closing leaves the console hidden.
test("closing Add funds opened from the wallet menu leaves the console reachable", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  await openAddFundsFromWalletMenu(page);

  const addFunds = page.getByRole("dialog", { name: "Add funds" });
  await addFunds.getByRole("button", { name: "Close" }).click();
  await expect(addFunds.getByRole("heading", { name: "Add funds" })).toBeHidden();

  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible();
});

test("a connected wallet's Add funds lists swap first and deposit last", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  await openAddFundsFromWalletMenu(page);

  await expect(page.getByRole("dialog", { name: "Add funds" })).toMatchAriaSnapshot(`
    - button "Swap to USDFC"
    - button "Verify wallet to buy USDC with card"
    - button "Deposit token"
  `);
});

test("closing Deposit tokens after choosing it in Add funds leaves the console reachable", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  await openAddFundsFromWalletMenu(page);

  await page.getByRole("button", { name: "Deposit token" }).click();
  const deposit = page.getByRole("dialog", { name: "Deposit tokens" });
  await expect(deposit.getByRole("heading", { name: "Deposit tokens" })).toBeVisible();
  await deposit.getByRole("button", { name: "Close" }).click();
  await expect(deposit.getByRole("heading", { name: "Deposit tokens" })).toBeHidden();

  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible();
});

test("a Squid deposit paid from another account of the extension credits the console account", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  await openAddFundsFromWalletMenu(page);
  const consoleBefore = await consoleAccount(page);
  // MetaMask's account picker connects a second account; only that one holds USDC on Base.
  await page.evaluate(() => window.dispatchEvent(new Event("fake-privy:connect-other-account")));
  const [consoleAddress, payer] = await page.evaluate(
    () => (window as unknown as { __fakePrivyExtensionAccounts: Hex[] }).__fakePrivyExtensionAccounts,
  );
  const routeRequests = await installFakeSquid(page, payer);

  await page.getByRole("button", { name: "Swap to USDFC" }).click();
  const squid = page.getByRole("dialog", { name: "Pay with another token" });
  // The console account holds nothing to pay with, so the funded account is the default payer.
  await expect(squid.getByRole("combobox", { name: "Paying wallet" })).toContainText(
    `${payer.slice(0, 6)}...${payer.slice(-4)}`,
  );
  await squid.getByLabel(/^Amount/).fill("10");
  // Keep the run to the plain deposit.
  await squid.getByRole("checkbox").click();
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();
  await expect(page.getByRole("status", { name: "Squid deposit progress" })).toContainText(
    "Don't switch accounts in your wallet until the deposit finishes.",
  );

  // The approval, then the route.
  for (let i = 0; i < 2; i += 1) {
    const approve = page.getByRole("dialog", { name: "approve transaction" });
    await approve.getByRole("button", { name: "Approve" }).click();
    await approve.getByRole("button", { name: "All Done" }).click();
  }
  await expect(page.getByText("Deposited 10 USDFC into Filecoin Pay")).toBeVisible({ timeout: 30_000 });

  const sent = await page.evaluate(
    () => (window as unknown as { __fakePrivyTransactions: { from: string }[] }).__fakePrivyTransactions,
  );
  expect(sent.map((tx) => tx.from.toLowerCase())).toEqual([payer.toLowerCase(), payer.toLowerCase()]);
  // Every quote and the executed route pay from the payer into the console account.
  const routeParties = new Set(
    routeRequests.map((route) => `${route.fromAddress} -> ${route.toAddress}`.toLowerCase()),
  );
  expect([...routeParties]).toEqual([`${payer} -> ${consoleAddress}`.toLowerCase()]);
  expect(await consoleAccount(page)).toBe(consoleBefore);
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible();
});

// Reviews a 10 USDC Squid deposit paid from a second extension account; returns the review card.
async function reviewSquidDeposit(page: Page, squidOptions: Parameters<typeof installFakeSquid>[2]) {
  await openAddFundsFromWalletMenu(page);
  await page.evaluate(() => window.dispatchEvent(new Event("fake-privy:connect-other-account")));
  const [, payer] = await page.evaluate(
    () => (window as unknown as { __fakePrivyExtensionAccounts: Hex[] }).__fakePrivyExtensionAccounts,
  );
  await installFakeSquid(page, payer, squidOptions);
  await page.getByRole("button", { name: "Swap to USDFC" }).click();
  const squid = page.getByRole("dialog", { name: "Pay with another token" });
  await squid.getByLabel(/^Amount/).fill("10");
  await squid.getByRole("checkbox").click();
  await squid.getByRole("button", { name: "Review" }).click();
  const review = page.getByRole("region", { name: "Reviewed Squid deposit" });
  await expect(review).toContainText("Receive at least: 10 USDFC");
  return review;
}

async function approveFakeTransaction(page: Page) {
  const approve = page.getByRole("dialog", { name: "approve transaction" });
  await approve.getByRole("button", { name: "Approve" }).click();
  await approve.getByRole("button", { name: "All Done" }).click();
}

test("a Squid route that drops below the reviewed minimum returns to review, then deposits", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  const review = await reviewSquidDeposit(page, { executableRoute: () => ({ minimumShortfall: 10n ** 17n }) });
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();

  await expect(review).toContainText("Review the updated quote");
  await expect(review).toContainText("Receive at least: 9.9 USDFC");
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();
  await approveFakeTransaction(page);
  await approveFakeTransaction(page);
  await expect(page.getByText("Deposited 10 USDFC into Filecoin Pay")).toBeVisible({ timeout: 30_000 });
});

test("a Squid route that drops below the reviewed minimum after the approval returns to review without approving again", async ({
  page,
}) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  // The first route expires before the approval lands, so the route is fetched again, now below the review.
  const review = await reviewSquidDeposit(page, {
    executableRoute: (n) => (n === 1 ? { expiresInSeconds: 10 } : { minimumShortfall: 10n ** 17n }),
  });
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();
  await approveFakeTransaction(page);

  await expect(review).toContainText("Review the updated quote");
  await expect(review).toContainText("Receive at least: 9.9 USDFC");
  await expect(review).toContainText("Your wallet will confirm the Squid transaction.");
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();
  await approveFakeTransaction(page);
  await expect(page.getByText("Deposited 10 USDFC into Filecoin Pay")).toBeVisible({ timeout: 30_000 });

  const sent = await page.evaluate(
    () => (window as unknown as { __fakePrivyTransactions: { data?: string }[] }).__fakePrivyTransactions,
  );
  // One approval, paid once, then the route.
  expect(sent.map((tx) => tx.data?.slice(0, 10))).toEqual(["0x095ea7b3", "0x12345678"]);
});

test("a Squid deposit paid from an extension without Filecoin closes the dialog", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  await openAddFundsFromWalletMenu(page);
  const consoleBefore = await consoleAccount(page);
  // Rabby holds the USDC on Base but has no Filecoin network, so it cannot be switched back.
  await page.evaluate(() => window.dispatchEvent(new Event("fake-privy:connect-rabby")));
  const payer = await page.evaluate(
    () => (window as unknown as { __fakePrivyRabbyAccount: Hex }).__fakePrivyRabbyAccount,
  );
  await installFakeSquid(page, payer);

  await page.getByRole("button", { name: "Swap to USDFC" }).click();
  const squid = page.getByRole("dialog", { name: "Pay with another token" });
  await expect(squid.getByRole("combobox", { name: "Paying wallet" })).toContainText(
    `${payer.slice(0, 6)}...${payer.slice(-4)} · Rabby`,
  );
  await squid.getByLabel(/^Amount/).fill("10");
  // Keep the run to the plain deposit.
  await squid.getByRole("checkbox").click();
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();
  for (let i = 0; i < 2; i += 1) {
    const approve = page.getByRole("dialog", { name: "approve transaction" });
    await approve.getByRole("button", { name: "Approve" }).click();
    await approve.getByRole("button", { name: "All Done" }).click();
  }
  await expect(page.getByText("Deposited 10 USDFC into Filecoin Pay")).toBeVisible({ timeout: 30_000 });

  // The console's wallet never left Filecoin, so the dialog closes with Rabby still on Base.
  // Under either title: the review, or the form that shows a failed switch back. The dialog closes only after
  // the account's queries refetch.
  await expect(page.getByRole("heading", { name: /^(Review Squid deposit|Pay with another token)$/ })).toBeHidden({
    timeout: 30_000,
  });
  expect(await consoleAccount(page)).toBe(consoleBefore);
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible();
});

test("checking a Squid deposit whose route never landed stops and offers Dismiss", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  // The clock jumps past the source receipt wait rather than tracking its exact length.
  await page.clock.install();
  await openAddFundsFromWalletMenu(page);
  await page.evaluate(() => window.dispatchEvent(new Event("fake-privy:connect-other-account")));
  const [consoleAddress, payer] = await page.evaluate(
    () => (window as unknown as { __fakePrivyExtensionAccounts: Hex[] }).__fakePrivyExtensionAccounts,
  );
  await installFakeSquid(page, payer);
  const droppedHash = `0x${"0d".repeat(32)}`;
  // No Base RPC has a record of the hash, as with a route the wallet dropped; the app's transport asks each in turn.
  const baseRpcHosts = [...SOURCE_RPC_URLS[base.id], ...base.rpcUrls.default.http].map((url) => new URL(url).hostname);
  await page.route(
    (url) => baseRpcHosts.includes(url.hostname),
    (route) => {
      const body = route.request().postDataJSON() as { id: number; method: string; params: unknown[] } | null;
      const isLookup =
        (body?.method === "eth_getTransactionReceipt" || body?.method === "eth_getTransactionByHash") &&
        body.params[0] === droppedHash;
      if (!body || !isLookup) return route.fallback();
      return route.fulfill({ json: { jsonrpc: "2.0", id: body.id, result: null } });
    },
  );
  const statusRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/status")) statusRequests.push(request.url());
  });
  await page.evaluate(
    ({ owner, recipient, transactionHash }) =>
      localStorage.setItem(
        `filecoin-pay:squid-deposit:v1:${owner.toLowerCase()}`,
        JSON.stringify({
          executionStage: "swap-broadcast",
          fundsBefore: "0",
          minimumDestinationAmount: "10000000000000000000",
          owner,
          quoteId: "fake-quote-dropped",
          recipient,
          sourceAmount: "10000000",
          sourceChainId: 8453,
          sourceToken: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
          startedAt: Date.now(),
          transactionHash,
        }),
      ),
    { owner: payer, recipient: consoleAddress, transactionHash: droppedHash },
  );

  await page.getByRole("button", { name: "Swap to USDFC" }).click();
  const squid = page.getByRole("dialog", { name: "Pay with another token" });
  await expect(squid.getByText("A Squid deposit is still in progress.")).toBeVisible();
  await squid.getByRole("button", { name: "Check again" }).click();
  await expect(squid.getByText("Waiting for the source network to confirm…")).toBeVisible();
  await page.clock.fastForward("10:00");

  await expect(
    squid.getByText(/Check your wallet's activity before you dismiss this and start another deposit\./),
  ).toBeVisible();
  await expect(squid.getByRole("button", { name: "Dismiss" })).toBeEnabled();
  expect(statusRequests).toEqual([]);
});

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

test("an account switch closes the link's form, and reopening it names the new account, never the previous one", async ({
  page,
  baseURL,
}) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  const cli = await filecoinPin(`${baseURL}`);
  const link = consoleLink(await cli.run("login", "--no-browser", "--no-wait"), `${baseURL}`);
  await stubAccountBackgroundRequests(page);
  await page.goto(link);
  await page.getByRole("button", { name: "Connect existing wallet" }).click();
  const first = await consoleAccount(page);
  const [start] = first.split("...");
  await page.getByRole("button", { name: "Review and authorize" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Authorize as ${start}`, "i") })).toBeVisible();

  await switchExtensionAccount(page);

  await expect.poll(() => consoleAccount(page)).not.toBe(first);
  await expect(page.getByRole("dialog", { name: "New session key" })).toBeHidden();
  // The link stays in the URL, so the setup page still offers it, now for the new account.
  const [next] = (await consoleAccount(page)).split("...");
  await page.getByRole("button", { name: "Review and authorize" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Authorize as ${next}`, "i") })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`^Authorize as ${start}`, "i") })).toBeHidden();
});

async function connectAndOpenCardPurchase(page: Page): Promise<string> {
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await page.getByRole("button", { name: "Connect existing wallet" }).click();
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  const account = await consoleAccount(page);
  await openAddFunds(page);
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
  await openAddFunds(page);

  // The previous account's login does not carry over to the new one.
  await page.getByRole("button", { name: "Verify wallet to buy USDC with card" }).click();
  await page.getByRole("dialog", { name: "signature request" }).getByRole("button", { name: "Sign" }).click();
  const [start, end] = newAccount.split("...");
  await expect(page.getByRole("dialog", { name: "buy usdc" })).toContainText(start);
  await expect(page.getByRole("dialog", { name: "buy usdc" })).toContainText(end);
});

test("an email account's Add funds lists card first", async ({ page }) => {
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await loginWithTestAccount(page);
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  await openAddFunds(page);

  await expect(page.getByRole("dialog", { name: "Add funds" })).toMatchAriaSnapshot(`
    - button "Buy USDC with card"
    - button "Swap to USDFC"
    - button "Deposit token"
  `);
});

test("an email account opens the card purchase without another sign-in", async ({ page }) => {
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await loginWithTestAccount(page);
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  const account = await consoleAccount(page);
  await openAddFunds(page);

  await page.getByRole("button", { name: "Buy USDC with card", exact: true }).click();

  test.skip(process.env.E2E_MODE === "real", "the fake's card purchase window shows the destination");
  await expect(page.getByRole("dialog", { name: "signature request" })).toBeHidden();
  const [start, end] = account.split("...");
  await expect(page.getByRole("dialog", { name: "buy usdc" })).toContainText(start);
  await expect(page.getByRole("dialog", { name: "buy usdc" })).toContainText(end);
});

// Privy reports "submitted" after the provider's window closes even when nothing was paid, so the check that
// follows must leave Add funds dismissible and the purchase easy to discard.
test("closing an unpaid card purchase leaves Add funds dismissible and recoverable", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake card purchase window");
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await loginWithTestAccount(page);
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  await openAddFunds(page);
  await page.getByRole("button", { name: "Buy USDC with card", exact: true }).click();
  await page.getByRole("dialog", { name: "buy usdc" }).getByRole("button", { name: "Done" }).click();

  const addFunds = page.getByRole("dialog", { name: "Add funds" });
  await expect(addFunds.getByRole("status")).toContainText("Looking for purchased USDC on Base");
  await addFunds.getByRole("button", { name: "Close" }).click();
  await expect(addFunds.getByRole("heading", { name: "Add funds" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible();

  await openAddFunds(page);
  await expect(addFunds.getByRole("button", { name: "Check for purchased USDC" })).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await addFunds.getByRole("button", { name: "Start over" }).click();
  await expect(addFunds.getByRole("button", { name: "Buy USDC with card", exact: true })).toBeEnabled();
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
