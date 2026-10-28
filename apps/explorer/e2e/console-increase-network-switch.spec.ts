import { expect, test } from "./fixtures";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

// Regression: the Increase Approval form outlived a wallet network switch and would submit the old network's approval
// against the new network's Payments contract.
test("switching the wallet's network closes an open Increase Approval form", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
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
      if (query.includes("GetAccountApprovals"))
        return route.fulfill({ json: { data: { operatorApprovals: [approval] } } });
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
  const switchChain = (chainId: number) =>
    page.evaluate((id) => window.dispatchEvent(new CustomEvent("fake-privy:switch-chain", { detail: id })), chainId);
  const increase = page.getByRole("button", { name: "Increase", exact: true });
  await page.getByRole("button", { name: "Connect existing wallet" }).click();
  await expect(increase).toBeVisible({ timeout: 30_000 });

  // Visit calibration first: with its account cached, the next switch keeps the section mounted instead of
  // replacing it with a loading state, which is when a stale form could survive.
  await switchChain(314159);
  await expect(page.getByRole("button", { name: /current network Calibration/ })).toBeVisible();
  await expect(increase).toBeVisible();
  await switchChain(314);
  await expect(page.getByRole("button", { name: /current network Mainnet/ })).toBeVisible();

  await increase.click();
  const dialog = page.getByRole("heading", { name: "Increase Approval" });
  await expect(dialog).toBeVisible();

  await switchChain(314159);
  await expect(page.getByRole("button", { name: /current network Calibration/ })).toBeVisible();
  await expect(dialog).toBeHidden();
});
