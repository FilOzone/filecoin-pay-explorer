import type { Page } from "@playwright/test";
import { decodeFunctionData, type Hex, maxUint256 } from "viem";
import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

const OPERATOR = "0x2222222222222222222222222222222222222222";
const USDFC = { id: "0x3333333333333333333333333333333333333333", symbol: "USDFC", decimals: "18" };
const OLD_TOKEN = { id: "0x6666666666666666666666666666666666666666", symbol: "OLD", decimals: "18" };
const THIRTY_DAYS_IN_EPOCHS = "86400";
const TOKEN = 10n ** 18n;

/**
 * The index says the lockup limit is 5 USDFC; the fake chain (fake-chain.ts) holds 1 USDFC with a 1 USDFC per epoch
 * rate, so a form built from the index would sign the wrong totals.
 */
const approvals = [
  {
    id: "usdfc",
    isApproved: true,
    rateAllowance: maxUint256.toString(),
    lockupAllowance: (5n * TOKEN).toString(),
    maxLockupPeriod: THIRTY_DAYS_IN_EPOCHS,
    token: USDFC,
  },
  { id: "old", isApproved: false, rateAllowance: "0", lockupAllowance: "0", maxLockupPeriod: "0", token: OLD_TOKEN },
];

async function stubServicePage(page: Page) {
  const state = { failRefreshes: false, failedRequests: 0, indexedBlock: 1, lockupAllowance: (5n * TOKEN).toString() };
  await page.addInitScript((operator) => {
    (window as unknown as { __fakeApprovedOperators: string[] }).__fakeApprovedOperators = [operator];
  }, OPERATOR);
  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => {
      const query: string = route.request().postDataJSON()?.query ?? "";
      if (state.failRefreshes && (query.includes("GetAccountOperator(") || query.includes("GetServiceApprovals"))) {
        state.failedRequests++;
        return route.fulfill({ status: 500 });
      }
      if (query.includes("GetSubgraphBlock")) {
        return route.fulfill({ json: { data: { _meta: { block: { number: state.indexedBlock } } } } });
      }
      if (query.includes("GetAccountOperator(")) {
        const accountOperator = {
          id: "service",
          totalRails: "0",
          totalActiveRails: "0",
          totalApprovals: "2",
          totalActiveApprovals: "1",
          operator: { id: OPERATOR, address: OPERATOR },
        };
        return route.fulfill({ json: { data: { accountOperator } } });
      }
      if (query.includes("GetServiceApprovals")) {
        return route.fulfill({
          json: {
            data: { operatorApprovals: [{ ...approvals[0], lockupAllowance: state.lockupAllowance }, approvals[1]] },
          },
        });
      }
      return route.fulfill({ json: { data: { accounts: [], userTokens: [], rails: [], dataSets: [] } } });
    },
  );
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );
  return state;
}

async function openLimitsDialog(page: Page, email: string) {
  await stubServicePage(page);
  await page.goto(`/console/services/${OPERATOR}`);
  await loginWithTestAccount(page, { email });
  await page.getByRole("button", { name: "Edit USDFC limits" }).click({ timeout: 30_000 });
  const dialog = page.getByRole("dialog", { name: "Edit spending limits" });
  await expect(dialog.getByLabel("Lockup limit (USDFC)")).toBeVisible();
  return dialog;
}

async function approveAndReadTransaction(page: Page) {
  await page.getByRole("dialog", { name: "approve transaction" }).getByRole("button", { name: "Approve" }).click();
  const sent = await page.waitForFunction(
    () =>
      (window as typeof window & { __fakePrivyTransactions?: { to: string; data: Hex }[] })
        .__fakePrivyTransactions?.[0],
  );
  const tx = await sent.jsonValue();
  if (!tx) throw new Error("No transaction was sent");
  const { mainnet } = await import("@filoz/synapse-sdk");
  const payments = mainnet.contracts.filecoinPay;
  expect(tx.to.toLowerCase()).toBe(payments.address.toLowerCase());
  const { functionName, args } = decodeFunctionData({ abi: payments.abi, data: tx.data });
  expect(functionName).toBe("setOperatorApproval");
  return args;
}

const cellsOf = (page: Page, symbol: string) =>
  page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: symbol, exact: true }) })
    .getByRole("cell");

test.describe("spending limits on the service page", () => {
  test.skip(process.env.E2E_MODE === "real", "marks the approval in the fake chain");

  test("a service with on-chain metadata shows its self-reported name", async ({ page }) => {
    await page.addInitScript((address) => {
      const fake = window as unknown as {
        __fakeServiceMetadata: Record<string, { name: string; description: string }>;
      };
      fake.__fakeServiceMetadata = { [address]: { name: "Acme Storage", description: "Warm storage by Acme" } };
    }, OPERATOR);
    await stubServicePage(page);
    await page.goto(`/console/services/${OPERATOR}`);
    await loginWithTestAccount(page, { email: "spending-limits-metadata@fake-privy.test" });

    const heading = page.getByRole("heading", { name: "Acme Storage" });
    await expect(heading.getByRole("img", { name: "Self-reported on-chain name" })).toBeVisible();
    await expect(page.getByText("Warm storage by Acme", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Spending limits" })).toBeVisible();
  });

  test("lists active and revoked token limits, labelling unlimited ones", async ({ page }) => {
    await stubServicePage(page);
    await page.goto(`/console/services/${OPERATOR}`);
    await loginWithTestAccount(page, { email: "spending-limits-list@fake-privy.test" });

    await expect(cellsOf(page, "USDFC")).toHaveText(
      ["USDFC", "Active", "Unlimited", "5.000 USDFC", "30 days", "Edit USDFC limits"],
      { timeout: 30_000 },
    );
    await expect(cellsOf(page, "OLD")).toHaveText([
      "OLD",
      "Revoked",
      "0 OLD / month",
      "0 OLD",
      "0 days",
      "Approve OLD",
    ]);
  });

  // Regression: limits could only be raised, by adding to the indexed allowance, which can trail the chain.
  test("lowers a limit starting from the chain's value, not the index's", async ({ page }) => {
    const dialog = await openLimitsDialog(page, "spending-limits-lower@fake-privy.test");
    const lockup = dialog.getByLabel("Lockup limit (USDFC)");
    await expect(lockup).toHaveValue("1");

    await lockup.fill("0.5");
    await expect(dialog.getByRole("table", { name: "Current and new limits" })).toContainText(
      "Lockup1.000 USDFC0.500 USDFC",
    );
    await dialog.getByRole("button", { name: "Update limits" }).click();

    expect(await approveAndReadTransaction(page)).toEqual([USDFC.id, OPERATOR, true, TOKEN, TOKEN / 2n, 86400n]);
  });

  test("revokes the service after a confirmation", async ({ page }) => {
    const dialog = await openLimitsDialog(page, "spending-limits-revoke@fake-privy.test");
    await dialog.getByRole("button", { name: "Revoke" }).click();
    const confirmation = page.getByRole("dialog", { name: "Revoke USDFC approval?" });
    await expect(confirmation.getByText("Rails you already have with this service keep running")).toBeVisible();
    await confirmation.getByRole("button", { name: "Revoke" }).click();

    expect(await approveAndReadTransaction(page)).toEqual([USDFC.id, OPERATOR, false, 0n, 0n, 0n]);
  });

  test("refuses a draft when the approval changed on chain before submission", async ({ page }) => {
    const dialog = await openLimitsDialog(page, "spending-limits-changed@fake-privy.test");
    await dialog.getByLabel("Lockup limit (USDFC)").fill("2");
    await page.evaluate(() => {
      (window as unknown as { __fakeApprovedOperators: string[] }).__fakeApprovedOperators = [];
    });
    await dialog.getByRole("button", { name: "Update limits" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: "Your limits changed on chain, review again" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Approve service again" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "approve transaction" })).toHaveCount(0);
    await expect(page.getByLabel("Lockup limit (USDFC)")).toHaveValue("0");
  });

  test("keeps the pending wallet request mounted when service and approvals refreshes fail", async ({ page }) => {
    const state = await stubServicePage(page);
    await page.goto(`/console/services/${OPERATOR}`);
    await loginWithTestAccount(page, { email: "spending-limits-refresh-error@fake-privy.test" });
    await page.getByRole("button", { name: "Edit USDFC limits" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit spending limits" });
    await dialog.getByLabel("Lockup limit (USDFC)").fill("2");
    await dialog.getByRole("button", { name: "Update limits" }).click();
    const wallet = page.getByRole("dialog", { name: "approve transaction" });
    await expect(wallet).toBeVisible();

    state.failRefreshes = true;
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => state.failedRequests, { timeout: 15_000 }).toBeGreaterThanOrEqual(8);

    await expect(dialog).toContainText("Processing...");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await expect(wallet).toBeVisible();
  });

  test("refreshes the limits when the index reaches the confirmed transaction's block", async ({ page }) => {
    const state = await stubServicePage(page);
    state.indexedBlock = 0;
    await page.goto(`/console/services/${OPERATOR}`);
    await loginWithTestAccount(page, { email: "spending-limits-indexing@fake-privy.test" });
    await page.getByRole("button", { name: "Edit USDFC limits" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit spending limits" });
    await dialog.getByLabel("Lockup limit (USDFC)").fill("0.5");
    await dialog.getByRole("button", { name: "Update limits" }).click();
    await approveAndReadTransaction(page);
    await page.getByRole("dialog", { name: "approve transaction" }).getByRole("button", { name: "All Done" }).click();

    const notice = page.getByRole("status").filter({ hasText: "These limits refresh once it is indexed" });
    await expect(notice).toBeVisible();
    await expect(cellsOf(page, "USDFC").nth(3)).toHaveText("5.000 USDFC");
    state.lockupAllowance = (TOKEN / 2n).toString();
    state.indexedBlock = 1;

    await expect(cellsOf(page, "USDFC").nth(3)).toHaveText("0.500 USDFC");
    await expect(notice).toBeHidden();
  });

  // Regression: an unlimited field was disabled without looking it, so clicking in and typing did nothing.
  test("typing into an unlimited field sets a limit, and Unlimited keeps the draft", async ({ page }) => {
    const dialog = await openLimitsDialog(page, "spending-limits-unlimited@fake-privy.test");
    const lockup = dialog.getByLabel("Lockup limit (USDFC)");
    const unlimited = dialog.getByRole("checkbox", { name: "Unlimited lockup", exact: true });
    const comparison = dialog.getByRole("table", { name: "Current and new limits" });

    await unlimited.check();
    await expect(lockup).toHaveValue("");
    await expect(comparison).toContainText("Lockup1.000 USDFCUnlimited");

    await lockup.pressSequentially("2");
    await expect(unlimited).not.toBeChecked();
    await expect(comparison).toContainText("Lockup1.000 USDFC2.000 USDFC");

    await unlimited.check();
    await unlimited.uncheck();
    await expect(lockup).toHaveValue("2");
    await expect(lockup).toBeFocused();
  });

  test("stays open while the wallet request is pending", async ({ page }) => {
    const dialog = await openLimitsDialog(page, "spending-limits-busy@fake-privy.test");
    await dialog.getByLabel("Lockup limit (USDFC)").fill("2");
    await dialog.getByRole("button", { name: "Update limits" }).click();

    // Approving and then closing the wallet dialog leaves the request unsettled, as real Privy does.
    const wallet = page.getByRole("dialog", { name: "approve transaction" });
    await wallet.getByRole("button", { name: "Approve" }).click();
    await expect(wallet.getByText("Loading...")).toBeVisible();
    await wallet.getByRole("button", { name: "close modal" }).click();
    await expect(dialog).toContainText("Processing...");

    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5);
    await expect(dialog.getByRole("button", { name: "Close" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    // A dismissed panel stays visible through its leave transition, so check it never started closing.
    await expect(dialog.locator("[data-slot='dialog-content']")).not.toHaveAttribute("data-closed");
  });

  // Regression: a limits form outlived a wallet network switch and would submit the old network's approval against
  // the new network's Payments contract.
  test("switching the wallet's network closes an open limits form", async ({ page }) => {
    await stubServicePage(page);
    await page.goto(`/console/services/${OPERATOR}`);
    const switchChain = (chainId: number) =>
      page.evaluate((id) => window.dispatchEvent(new CustomEvent("fake-privy:switch-chain", { detail: id })), chainId);
    const edit = page.getByRole("button", { name: "Edit USDFC limits" });
    await page.getByRole("button", { name: "Connect existing wallet" }).click();
    await expect(edit).toBeVisible({ timeout: 30_000 });

    // Visit calibration first: with its data cached, the next switch keeps the page mounted instead of replacing it
    // with a loading state, which is when a stale form could survive.
    await switchChain(314159);
    await expect(page.getByRole("button", { name: /current network Calibration/ })).toBeVisible();
    await expect(edit).toBeVisible();
    await switchChain(314);
    await expect(page.getByRole("button", { name: /current network Mainnet/ })).toBeVisible();

    await edit.click();
    const heading = page.getByRole("heading", { name: "Edit spending limits" });
    await expect(heading).toBeVisible();

    await switchChain(314159);
    await expect(page.getByRole("button", { name: /current network Calibration/ })).toBeVisible();
    await expect(heading).toBeHidden();
  });
});
