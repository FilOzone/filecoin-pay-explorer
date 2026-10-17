import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// Warm Storage approved and USDFC in the wallet: the link's deposit is a plain wallet deposit, not Add funds.
test.describe("setup link for an approved account with USDFC in the wallet", () => {
  test.skip(process.env.E2E_MODE === "real", "sets the approval and the wallet's USDFC in the fake chain");

  test("deposits the shortfall in the Deposit dialog, opened on USDFC and the amount", async ({ page }) => {
    const { mainnet } = await import("@filoz/synapse-sdk");
    await page.addInitScript((fwss) => {
      const fake = window as unknown as { __fakeApprovedOperators: string[]; __fakeUsdfcBalance: string };
      fake.__fakeApprovedOperators = [fwss];
      fake.__fakeUsdfcBalance = (5n * 10n ** 18n).toString();
    }, mainnet.contracts.fwss.address);
    await page.goto("/console/setup?deposit=2&network=mainnet");
    await loginWithTestAccount(page);

    await expect(page.locator("ol > li h2")).toHaveText(["Step 1: Approve Warm Storage", "Step 2: Fund Filecoin Pay"], {
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Add funds" })).toHaveCount(0);
    await page.getByRole("button", { name: "Deposit 2 USDFC" }).click();

    const dialog = page.getByRole("dialog", { name: "Deposit tokens" });
    await expect(dialog.getByRole("textbox", { name: "Token contract address" })).toHaveValue(
      mainnet.contracts.usdfc.address,
    );
    await expect(dialog.getByRole("spinbutton", { name: "Amount" })).toHaveValue("2", { timeout: 30_000 });
    await expect(dialog.getByText(/Balance: 5 USDFC/)).toBeVisible();
  });
});
