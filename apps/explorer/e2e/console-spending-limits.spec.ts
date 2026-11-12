import type { Page } from "@playwright/test";
import { decodeFunctionData, type Hex, maxUint256 } from "viem";
import { answerServicePageRpc } from "./fake-chain";
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

async function stubServicePage(page: Page, index = { block: 1, approvals }) {
  await page.addInitScript((operator) => {
    (window as unknown as { __fakeApprovedOperators: string[] }).__fakeApprovedOperators = [operator];
  }, OPERATOR);
  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => {
      const query: string = route.request().postDataJSON()?.query ?? "";
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
        return route.fulfill({ json: { data: { operatorApprovals: index.approvals } } });
      }
      if (query.includes("GetSubgraphBlock")) {
        return route.fulfill({ json: { data: { _meta: { block: { number: index.block } } } } });
      }
      return route.fulfill({ json: { data: { accounts: [], userTokens: [], rails: [], dataSets: [] } } });
    },
  );
  await answerServicePageRpc(page, OPERATOR);
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );
}

async function openLimitsDialog(page: Page, email: string, index?: Parameters<typeof stubServicePage>[1]) {
  await stubServicePage(page, index);
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

  // Regression: after the receipt the table kept the old indexed limits, with nothing saying an update was coming.
  test("says a confirmed update is being indexed, then shows the new limit", async ({ page }) => {
    const index = { block: 0, approvals };
    const dialog = await openLimitsDialog(page, "spending-limits-indexing@fake-privy.test", index);
    await dialog.getByLabel("Lockup limit (USDFC)").fill("0.5");
    await dialog.getByRole("button", { name: "Update limits" }).click();
    const wallet = page.getByRole("dialog", { name: "approve transaction" });
    await wallet.getByRole("button", { name: "Approve" }).click();
    await wallet.getByRole("button", { name: "All Done" }).click();

    const indexing = page.getByText("These limits refresh once it is indexed.");
    await expect(indexing).toBeVisible();
    await expect(cellsOf(page, "USDFC").nth(3)).toHaveText("5.000 USDFC");

    // The fake chain confirms every transaction in block 1.
    index.approvals = [{ ...approvals[0], lockupAllowance: (TOKEN / 2n).toString() }, approvals[1]];
    index.block = 1;
    await expect(cellsOf(page, "USDFC").nth(3)).toHaveText("0.500 USDFC");
    await expect(indexing).toBeHidden();
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
