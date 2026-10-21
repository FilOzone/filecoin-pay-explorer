import type { Page } from "@playwright/test";
import { decodeFunctionData, erc20Abi, type Hex, parseAbi } from "viem";
import { installFakeSquid } from "./fake-squid";
import { type FakeUsdcGasOptions, installFakeUsdcGas } from "./fake-usdc-gas";
import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// An email account's embedded wallet holds Base USDC and no ETH: the deposit pays Base gas in USDC through Circle's
// paymaster and swaps USDC for Squid's bridge fee, all in one user operation from the wallet's own address.

// 0.25 USDC at the fake's ETH price, so the swap and gas fit inside the 0.5 USDC fee reserve.
const BRIDGE_FEE = 100_000_000_000_000n;
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const PAYMASTER = "0x0578cfb241215b77442a541325d6a4e6dfe700ec";
const SWAP_ROUTER = "0x2626664c2603336e57b271c5c0b26f421741e481";
const SQUID_ROUTER = "0xce16f69375520ab01377ce7b88f5ba8c48f8d666";

test.skip(process.env.E2E_MODE === "real", "needs the fake bundler");

// These tests end right after a deposit settles or fails, when the dialog and console refetch quotes and balances;
// the no-network fixture must not tear down while one of those is still being answered.
const inFlight = new WeakMap<Page, { count: number; lastStart: number }>();
test.beforeEach(({ page }) => {
  const traffic = { count: 0, lastStart: Date.now() };
  inFlight.set(page, traffic);
  page.on("request", () => {
    traffic.count += 1;
    traffic.lastStart = Date.now();
  });
  const done = () => {
    traffic.count -= 1;
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
});
test.afterEach(async ({ page }) => {
  const traffic = inFlight.get(page);
  if (!traffic) return;
  await expect
    .poll(() => traffic.count === 0 && Date.now() - traffic.lastStart > 1_000, { timeout: 15_000 })
    .toBe(true);
});

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

const EMAIL = "usdc-gas@fake-privy.test";

async function openSquidDialog(page: Page) {
  await page.locator('[data-slot="dropdown-menu-trigger"]:not([aria-label])').click();
  await page.getByRole("menuitem", { name: "Add funds" }).click();
  await page.getByRole("button", { name: "Swap to USDFC" }).click();
  return page.getByRole("dialog", { name: "Pay with another token" });
}

async function reviewDeposit(
  page: Page,
  {
    executableRoute,
    payerEth = 0n,
    ...initial
  }: Pick<NonNullable<Parameters<typeof installFakeSquid>[2]>, "executableRoute" | "payerEth"> &
    FakeUsdcGasOptions = {},
) {
  await stubAccountBackgroundRequests(page);
  await page.goto("/console");
  await loginWithTestAccount(page, { email: EMAIL });
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  const payer = await page.evaluate(
    () => (window as unknown as { __fakePrivyEmbeddedAccount: Hex }).__fakePrivyEmbeddedAccount,
  );
  const fake = await installFakeUsdcGas(page, payer, initial);
  await installFakeSquid(page, payer, { alsoRead: fake.read, executableRoute, nativeFee: BRIDGE_FEE, payerEth });

  const squid = await openSquidDialog(page);
  await squid.getByLabel(/^Amount/).fill("10");
  return { fake, payer, squid };
}

const sentTransactions = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fakePrivyTransactions?: unknown[] }).__fakePrivyTransactions ?? []);
const signedAuthorizations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fakePrivyAuthorizations?: unknown[] }).__fakePrivyAuthorizations ?? []);

// The batch as target and function, read from Simple7702Account's executeBatch call data.
function describeBatch(callData: Hex) {
  const { args } = decodeFunctionData({
    abi: parseAbi(["function executeBatch((address target, uint256 value, bytes data)[] calls)"]),
    data: callData,
  });
  return args[0].map(({ data, target, value }) => {
    const to = target.toLowerCase();
    if (to !== USDC) return { to, value };
    const { args: approval } = decodeFunctionData({ abi: erc20Abi, data });
    return { to, approve: [String(approval[0]).toLowerCase(), approval[1]] as const };
  });
}

test("a zero-ETH email account deposits card USDC with network fees paid in USDC", async ({ page }) => {
  const { fake, squid } = await reviewDeposit(page);
  await squid.getByRole("button", { name: "Review" }).click();

  await expect(page.getByText("Deposit: 9.5 USDC")).toBeVisible();
  await expect(page.getByText("Held for network fees: 0.5 USDC")).toBeVisible();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();

  await expect(page.getByText(/^Deposited [\d.]+ USDFC into Filecoin Pay$/)).toBeVisible({ timeout: 30_000 });
  expect(await sentTransactions(page)).toEqual([]);
  expect(await signedAuthorizations(page)).toHaveLength(1);
  const [operation] = fake.operations;
  expect(fake.operations).toHaveLength(1);
  expect(operation.userOperation.authorization).toBeDefined();
  expect(operation.userOperation.paymaster?.toLowerCase()).toBe(PAYMASTER);
  const batch = describeBatch(operation.userOperation.callData);
  expect(batch.map((call) => (call.approve ? `approve ${call.approve[0]}` : call.to))).toEqual([
    `approve ${SWAP_ROUTER}`,
    SWAP_ROUTER,
    `approve ${SWAP_ROUTER}`,
    `approve ${SQUID_ROUTER}`,
    SQUID_ROUTER,
    `approve ${SQUID_ROUTER}`,
    `approve ${PAYMASTER}`,
  ]);
  expect(batch[3]).toEqual({ to: USDC, approve: [SQUID_ROUTER, 9_500_000n] });
  expect(batch[4]).toEqual({ to: SQUID_ROUTER, value: BRIDGE_FEE });
  expect(batch[5]).toEqual({ to: USDC, approve: [SQUID_ROUTER, 0n] });
  expect(batch[6]).toEqual({ to: USDC, approve: [PAYMASTER, 0n] });
  expect(fake.delegation).toBe("ours");
});

test("a returning account reuses its delegation without a new authorization", async ({ page }) => {
  const { fake, squid } = await reviewDeposit(page, { delegation: "ours" });
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();

  await expect(page.getByText(/^Deposited [\d.]+ USDFC into Filecoin Pay$/)).toBeVisible({ timeout: 30_000 });
  expect(await signedAuthorizations(page)).toEqual([]);
  expect(fake.operations.map((op) => op.userOperation.authorization)).toEqual([undefined]);
});

test("an email account that holds ETH still pays network fees in USDC", async ({ page }) => {
  const { fake, squid } = await reviewDeposit(page, { payerEth: 10n ** 18n });
  await squid.getByRole("button", { name: "Review" }).click();

  await expect(page.getByText("Held for network fees: 0.5 USDC")).toBeVisible();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();
  await expect(page.getByText(/^Deposited [\d.]+ USDFC into Filecoin Pay$/)).toBeVisible({ timeout: 30_000 });
  expect(await sentTransactions(page)).toEqual([]);
  expect(fake.operations).toHaveLength(1);
});

test("an account delegated to another contract is not offered USDC gas", async ({ page }) => {
  const { fake, squid } = await reviewDeposit(page, { delegation: "conflict" });

  await expect(
    squid.getByText(/is set up with another smart account, so its network fees can't be paid in USDC\./),
  ).toBeVisible();
  await expect(squid.getByRole("button", { name: "Review" })).toBeDisabled();
  expect(fake.delegation).toBe("conflict");
});

test("a reverted operation says gas was charged in USDC, keeps the delegation, and can be retried", async ({
  page,
}) => {
  const { fake, squid } = await reviewDeposit(page, { outcome: "reverted" });
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();

  await expect(
    page.getByText(
      /reverted on Base, so no USDC went to Squid and it is still in this account\. Network fees were still charged/,
    ),
  ).toBeVisible({
    timeout: 30_000,
  });
  expect(fake.delegation).toBe("ours");
  // Nothing is left to follow up: no pending deposit blocks the form.
  await expect(squid.getByRole("region", { name: "Pending Squid deposit" })).toBeHidden();
  fake.outcome = "included";
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();
  await expect(page.getByText(/^Deposited [\d.]+ USDFC into Filecoin Pay$/)).toBeVisible({ timeout: 30_000 });
  expect(fake.operations).toHaveLength(2);
});

test("network fees above the reserve stop before signing, and a retry goes through once they fall", async ({
  page,
}) => {
  const { fake, squid } = await reviewDeposit(page);
  await squid.getByRole("button", { name: "Review" }).click();
  // Far more L1 data than the reserve covers.
  fake.preVerificationGas = 50_000_000n;
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();

  await expect(page.getByText("Network fees are above the reserve. Try again later.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText("No deposit is pending. Pay again to retry, or go back to get a new quote."),
  ).toBeVisible();
  expect(fake.operations).toEqual([]);

  fake.preVerificationGas = 60_000n;
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();
  await expect(page.getByText(/^Deposited [\d.]+ USDFC into Filecoin Pay$/)).toBeVisible({ timeout: 30_000 });
  expect(fake.operations).toHaveLength(1);
});

test("a route that drops below the reviewed minimum returns USDC gas to review, then deposits", async ({ page }) => {
  const { fake, squid } = await reviewDeposit(page, {
    executableRoute: (n) => (n === 1 ? { minimumShortfall: 10n ** 17n } : {}),
  });
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();

  await expect(
    squid.getByText("The minimum USDFC received fell below the reviewed amount. Review the deposit again."),
  ).toBeVisible({ timeout: 30_000 });
  expect(fake.operations).toEqual([]);
  await expect(page.getByText(/enough native token/)).toBeHidden();

  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();
  await expect(page.getByText(/^Deposited [\d.]+ USDFC into Filecoin Pay$/)).toBeVisible({ timeout: 30_000 });
  expect(fake.operations).toHaveLength(1);
});

test("a route close to expiry is replaced before the operation is signed, then deposits", async ({ page }) => {
  let executableRoutes = 0;
  const { fake, squid } = await reviewDeposit(page, {
    executableRoute: (n) => {
      executableRoutes = n;
      // Inside the margin the signing prompts need, though not yet expired.
      return n === 1 ? { expiresInSeconds: 20 } : {};
    },
  });
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();

  await expect(page.getByText(/^Deposited [\d.]+ USDFC into Filecoin Pay$/)).toBeVisible({ timeout: 30_000 });
  expect(executableRoutes).toBe(2);
  expect(fake.operations).toHaveLength(1);
});

test("a route that keeps expiring returns to review rather than retrying the same payment", async ({ page }) => {
  const { fake, squid } = await reviewDeposit(page, { executableRoute: () => ({ expiresInSeconds: 5 }) });
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();

  await expect(
    squid.getByText("The Squid route kept expiring before the deposit could be sent. Review the deposit again."),
  ).toBeVisible({ timeout: 30_000 });
  expect(fake.operations).toEqual([]);
  await expect(squid.getByRole("button", { name: "Review" })).toBeEnabled();
});

test("a USDC-gas plan that cannot be made says why and can be retried", async ({ page }) => {
  // Circle's surcharge above the 10% its docs state.
  const { fake, squid } = await reviewDeposit(page, { feeSpreadBips: 1_001n });

  await expect(squid.getByText(/Circle's USDC gas surcharge is above 10%/)).toBeVisible();
  await expect(squid.getByRole("button", { name: "Review" })).toBeDisabled();

  fake.feeSpreadBips = 1_000n;
  await squid.getByRole("button", { name: "Retry" }).click();
  await expect(squid.getByRole("button", { name: "Review" })).toBeEnabled();
});

test("a deposit the bundler refuses says nothing was charged and can be paid again", async ({ page }) => {
  const { fake, squid } = await reviewDeposit(page, { outcome: "rejected" });
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();

  await expect(page.getByText(/The bundler refused the deposit, so nothing was charged/)).toBeVisible({
    timeout: 30_000,
  });
  // Nothing is left to follow up, so the form is back to review the same deposit.
  await expect(squid.getByRole("region", { name: "Pending Squid deposit" })).toBeHidden();
  fake.outcome = "included";
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();
  await expect(page.getByText(/^Deposited [\d.]+ USDFC into Filecoin Pay$/)).toBeVisible({ timeout: 30_000 });
  expect(fake.operations).toHaveLength(1);
});

test("an operation not yet included blocks another spend until Check again finds it", async ({ page }) => {
  // The clock jumps past the inclusion wait rather than tracking its exact length.
  await page.clock.install();
  const { fake, squid } = await reviewDeposit(page, { outcome: "unresolved" });
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC + FIL" }).click();
  await expect.poll(() => fake.operations.length).toBe(1);
  // Sent, not signing: the operation is waiting for Base to include it.
  await expect(squid.getByText("Waiting for the source network to confirm…")).toBeVisible();
  await page.clock.fastForward("03:00");

  await expect(squid.getByText(/has not been included on Base yet/)).toBeVisible();
  await expect(squid.getByText("waiting to be included on Base", { exact: false })).toBeVisible();
  await expect(squid.getByRole("button", { name: "Review" })).toBeHidden();

  // The marker outlives the page: a reload and a new login find the operation again.
  await page.reload();
  await loginWithTestAccount(page, { email: EMAIL });
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  const reopened = await openSquidDialog(page);
  await expect(reopened.getByText("waiting to be included on Base", { exact: false })).toBeVisible();
  await reopened.getByRole("button", { name: "Check again" }).click();
  // While the bundler may still include it, the marker cannot be dismissed.
  await expect(reopened.getByText("Waiting for the source network to confirm…")).toBeVisible();
  await expect(reopened.getByRole("button", { name: "Dismiss" })).toBeHidden();

  fake.operations[0].outcome = "included";
  await expect(page.getByText(/^Deposited [\d.]+ USDFC into Filecoin Pay$/)).toBeVisible({ timeout: 30_000 });
  expect(fake.operations).toHaveLength(1);
});
