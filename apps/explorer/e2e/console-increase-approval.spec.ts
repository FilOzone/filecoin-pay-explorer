import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

async function openIncreaseDialog(page: Page, email: string) {
  const approval = {
    id: "approval-1",
    isApproved: true,
    maxLockupPeriod: "86400",
    lockupAllowance: "1000000000000000000",
    rateAllowance: "1000000000000000000",
    lockupUsage: "0",
    rateUsage: "0",
    operator: {
      id: "0x2222222222222222222222222222222222222222",
      address: "0x2222222222222222222222222222222222222222",
    },
    token: { id: "0x3333333333333333333333333333333333333333", name: "USDFC", symbol: "USDFC", decimals: "18" },
  };
  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => {
      const query = route.request().postData() ?? "";
      if (query.includes("GetAccountApprovals")) {
        return route.fulfill({ json: { data: { operatorApprovals: [approval] } } });
      }
      if (query.includes("GetAccountDetails")) {
        const account = { id: "0x1", address: "0x1", totalRails: "0", totalTokens: "0", totalApprovals: "1" };
        return route.fulfill({ json: { data: { accounts: [account] } } });
      }
      return route.fulfill({ json: { data: { accounts: [], userTokens: [], operatorApprovals: [] } } });
    },
  );
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );

  await page.goto("/console");
  await loginWithTestAccount(page, { email });
  await page.getByRole("button", { name: "Increase", exact: true }).click({ timeout: 30_000 });
  return page.getByRole("dialog", { name: "Increase Approval" });
}

// Regression: a value like 1.5 in the lockup period field threw after the dialog had entered its busy state, leaving
// it on "Processing..." until it was closed and reopened.
test("Increase stays unavailable for an unparsable lockup period instead of getting stuck", async ({ page }) => {
  const dialog = await openIncreaseDialog(page, "increase-approval@fake-privy.test");
  await dialog.getByLabel("Lockup Increase").fill("1");
  const submit = dialog.getByRole("button", { name: "Increase", exact: true });
  await expect(submit).toBeEnabled();

  await dialog.getByLabel("Maximum Lockup Period Increase").fill("1.5");
  await expect(submit).toBeDisabled();
  await expect(submit).not.toContainText("Processing");
});

test("Increase Approval stays open while the wallet request is pending", async ({ page }) => {
  const dialog = await openIncreaseDialog(page, "increase-approval-busy@fake-privy.test");
  await dialog.getByLabel("Lockup Increase").fill("1");
  await dialog.getByRole("button", { name: "Increase", exact: true }).click();

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
