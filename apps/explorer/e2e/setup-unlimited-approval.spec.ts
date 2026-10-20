import type { Page } from "@playwright/test";
import { decodeFunctionData, type Hex, maxUint256 } from "viem";
import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// A tool built on synapse-core needs Warm Storage approved without spending limits before it uploads.
const UNLIMITED_LINK = "/console/setup?operator=fwss&network=mainnet&approval=unlimited";

/** Marks Warm Storage approved in the fake chain, which reports the approval with limits (fake-chain.ts). */
async function approveWarmStorageWithLimits(page: Page) {
  const { mainnet } = await import("@filoz/synapse-sdk");
  await page.addInitScript((fwss) => {
    (window as unknown as { __fakeApprovedOperators: string[] }).__fakeApprovedOperators = [fwss];
  }, mainnet.contracts.fwss.address);
}

const warmStorageStep = (page: Page) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: /Approve Warm Storage$/ }) });

test.describe("setup link that needs Warm Storage without spending limits", () => {
  test.skip(process.env.E2E_MODE === "real", "marks the approval in the fake chain");

  test("keeps limited approvals as done when the link does not ask", async ({ page }) => {
    await approveWarmStorageWithLimits(page);
    await page.goto("/console/setup?operator=fwss&network=mainnet");
    await loginWithTestAccount(page);

    await expect(warmStorageStep(page).getByText("Approved", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Remove spending limits" })).toHaveCount(0);
  });

  test("shows the limits and lifts them in one confirmed transaction", async ({ page }) => {
    await approveWarmStorageWithLimits(page);
    await page.goto(UNLIMITED_LINK);
    await loginWithTestAccount(page);

    const step = warmStorageStep(page);
    await expect(step.getByText("Approved with limits")).toBeVisible({ timeout: 30_000 });
    await expect(step.getByRole("row", { name: /^Lockup period/ })).toContainText("At least 30 days");
    await page.getByRole("button", { name: "Remove spending limits" }).click();
    await page
      .getByRole("dialog", { name: "Remove Warm Storage spending limits" })
      .getByRole("button", {
        name: "Remove limits",
      })
      .click();
    await page.locator("#privy-dialog").getByRole("button", { name: "Approve" }).click();

    const sent = await page.waitForFunction(
      () =>
        (window as typeof window & { __fakePrivyTransactions?: { to: string; data: Hex }[] })
          .__fakePrivyTransactions?.[0],
    );
    const tx = (await sent.jsonValue()) as { to: string; data: Hex };
    const { mainnet } = await import("@filoz/synapse-sdk");
    const payments = mainnet.contracts.filecoinPay;
    const { functionName, args } = decodeFunctionData({ abi: payments.abi, data: tx.data });
    expect(tx.to.toLowerCase()).toBe(payments.address.toLowerCase());
    expect(functionName).toBe("setOperatorApproval");
    expect(args).toEqual([
      mainnet.contracts.usdfc.address,
      mainnet.contracts.fwss.address,
      true,
      maxUint256,
      maxUint256,
      86_400n,
    ]);
  });
});
