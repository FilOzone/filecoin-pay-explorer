import type { Page } from "@playwright/test";
import { decodeFunctionData, erc20Abi, type Hex, parseAbi } from "viem";
import { installFakeSquid } from "./fake-squid";
import { type FakeUsdcGasOptions, installFakeUsdcGas } from "./fake-usdc-gas";
import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// An email account's embedded wallet holds Base USDC and no ETH: the deposit pays Base gas in USDC through Circle's
// paymaster and swaps USDC for Squid's bridge fee, all in one user operation from the wallet's own address.

const BRIDGE_FEE = 300_000_000_000_000n;
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
  // Installed before the page's own Plausible snippet, which keeps an existing `window.plausible`.
  await page.addInitScript(() => {
    const w = window as unknown as { __funnel: string[]; plausible: unknown };
    w.__funnel = [];
    w.plausible = (event: string, options?: { props?: { reason?: string } }) =>
      w.__funnel.push(options?.props?.reason ? `${event}:${options.props.reason}` : event);
  });
  await page.goto("/console");
  await loginWithTestAccount(page, { email: "usdc-gas@fake-privy.test" });
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  const payer = await page.evaluate(
    () => (window as unknown as { __fakePrivyEmbeddedAccount: Hex }).__fakePrivyEmbeddedAccount,
  );
  const fake = await installFakeUsdcGas(page, payer, initial);
  await installFakeSquid(page, payer, { alsoRead: fake.read, executableRoute, nativeFee: BRIDGE_FEE, payerEth });

  await page.locator('[data-slot="dropdown-menu-trigger"]:not([aria-label])').click();
  await page.getByRole("menuitem", { name: "Add funds" }).click();
  await page.getByRole("button", { name: "Swap to USDFC" }).click();
  const squid = page.getByRole("dialog", { name: "Pay with another token" });
  await squid.getByLabel(/^Amount/).fill("10");
  // The FIL top-up adds a Filecoin swap leg this fake Squid does not quote.
  await squid.getByRole("checkbox").click();
  return { fake, payer, squid };
}

/** The deposit funnel's events, with a failure's reason after a colon. */
const depositEvents = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as { __funnel: string[] }).__funnel)).filter(
    (event) => event.startsWith("usdc_gas_") || event === "console_deposit_confirmed",
  );

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

  await expect(page.getByText("Network fee maximum:")).toBeVisible();
  await expect(page.getByText(/Bridge fee: up to [\d.]+ USDC, swapped for ETH/)).toBeVisible();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();

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
    `approve ${PAYMASTER}`,
  ]);
  expect(batch[4]).toEqual({ to: SQUID_ROUTER, value: BRIDGE_FEE });
  expect(batch[5]).toEqual({ to: USDC, approve: [PAYMASTER, 0n] });
  expect(fake.delegation).toBe("ours");
  expect(await depositEvents(page)).toEqual([
    "usdc_gas_deposit_submitted",
    "usdc_gas_deposit_completed",
    "console_deposit_confirmed",
  ]);
});

test("a returning account reuses its delegation without a new authorization", async ({ page }) => {
  const { fake, squid } = await reviewDeposit(page, { delegation: "ours" });
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();

  await expect(page.getByText(/^Deposited [\d.]+ USDFC into Filecoin Pay$/)).toBeVisible({ timeout: 30_000 });
  expect(await signedAuthorizations(page)).toEqual([]);
  expect(fake.operations.map((op) => op.userOperation.authorization)).toEqual([undefined]);
});

test("an email account that holds ETH keeps paying network fees in ETH", async ({ page }) => {
  const { fake, squid } = await reviewDeposit(page, { payerEth: 10n ** 18n });
  await squid.getByRole("button", { name: "Review" }).click();

  await expect(page.getByText("Network gas maximum:")).toBeVisible();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();
  await expect(page.getByRole("dialog", { name: "approve transaction" })).toBeVisible();
  expect(fake.operations).toEqual([]);
});

test("an account delegated to another contract is not offered USDC gas", async ({ page }) => {
  const { fake, squid } = await reviewDeposit(page, { delegation: "conflict" });

  await expect(
    squid.getByText(
      /is set up with another smart account, so its network fees can't be paid in USDC\. Add ETH to pay them\./,
    ),
  ).toBeVisible();
  await expect(squid.getByRole("button", { name: "Review" })).toBeDisabled();
  expect(fake.delegation).toBe("conflict");
});

test("a reverted operation says gas was charged in USDC and keeps the delegation", async ({ page }) => {
  const { fake, squid } = await reviewDeposit(page, { outcome: "reverted" });
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();

  await expect(
    page.getByText(
      /reverted on Base, so no USDC went to Squid and it is still in this account\. Network fees of 0\.0215 USDC were still charged/,
    ),
  ).toBeVisible({
    timeout: 30_000,
  });
  expect(fake.delegation).toBe("ours");
  expect(await depositEvents(page)).toEqual(["usdc_gas_deposit_submitted", "usdc_gas_deposit_failed:reverted"]);
  // Nothing is left to follow up: no pending deposit blocks the form.
  await expect(squid.getByRole("region", { name: "Pending Squid deposit" })).toBeHidden();
  // The form quotes and plans again; ending once it can review leaves no request in flight.
  await expect(squid.getByRole("button", { name: "Review" })).toBeEnabled();
});

test("a bundler estimate above the reviewed USDC maximum asks for a review that then reserves enough", async ({
  page,
}) => {
  const { fake, squid } = await reviewDeposit(page);
  await squid.getByRole("button", { name: "Review" }).click();
  // Far more L1 data than the review reserved for.
  fake.preVerificationGas = 50_000_000n;
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();

  await expect(
    page.getByText("Network fees rose above the reviewed USDC maximum. Review the deposit again."),
  ).toBeVisible({ timeout: 30_000 });
  expect(fake.operations).toEqual([]);

  // The next review reserves what execution needed, so the same spike now fits.
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();
  await expect(page.getByText(/^Deposited [\d.]+ USDFC into Filecoin Pay$/)).toBeVisible({ timeout: 30_000 });
  expect(fake.operations).toHaveLength(1);
  expect(await depositEvents(page)).toEqual([
    "usdc_gas_deposit_failed:review",
    "usdc_gas_deposit_submitted",
    "usdc_gas_deposit_completed",
    "console_deposit_confirmed",
  ]);
});

test("a route that drops below the reviewed minimum returns USDC gas to review, then deposits", async ({ page }) => {
  const { fake, squid } = await reviewDeposit(page, {
    executableRoute: (n) => (n === 1 ? { minimumShortfall: 10n ** 17n } : {}),
  });
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();

  await expect(
    squid.getByText("The minimum USDFC received fell below the reviewed amount. Review the deposit again."),
  ).toBeVisible({ timeout: 30_000 });
  expect(fake.operations).toEqual([]);
  await expect(page.getByText(/enough native token/)).toBeHidden();

  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();
  await expect(page.getByText(/^Deposited [\d.]+ USDFC into Filecoin Pay$/)).toBeVisible({ timeout: 30_000 });
  expect(fake.operations).toHaveLength(1);
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

test("an operation not yet included blocks another spend until Check again finds it", async ({ page }) => {
  // The clock jumps past the inclusion wait rather than tracking its exact length.
  await page.clock.install();
  const { fake, squid } = await reviewDeposit(page, { outcome: "unresolved" });
  await squid.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Pay 10 USDC for USDFC" }).click();
  await expect.poll(() => fake.operations.length).toBe(1);
  // Sent, not signing: the operation is waiting for Base to include it.
  await expect(squid.getByText("Waiting for the source network to confirm…")).toBeVisible();
  await page.clock.fastForward("03:00");

  await expect(squid.getByText(/has not been included on Base yet/)).toBeVisible();
  await expect(squid.getByText("waiting to be included on Base", { exact: false })).toBeVisible();
  await expect(squid.getByRole("button", { name: "Review" })).toBeHidden();

  // Not included yet is not an outcome: nothing is counted as failed.
  expect(await depositEvents(page)).toEqual(["usdc_gas_deposit_submitted"]);

  fake.operations[0].outcome = "included";
  await squid.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText(/^Deposited [\d.]+ USDFC into Filecoin Pay$/)).toBeVisible({ timeout: 30_000 });
  expect(fake.operations).toHaveLength(1);
  expect(await depositEvents(page)).toEqual([
    "usdc_gas_deposit_submitted",
    "usdc_gas_deposit_completed",
    "console_deposit_confirmed",
  ]);
});
