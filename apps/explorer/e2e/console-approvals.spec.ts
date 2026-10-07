import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

const APPROVAL_COUNT = 12;

const approval = (index: number) => {
  const operator = `0x${(index + 1).toString(16).padStart(40, "0")}`;
  return {
    id: `approval-${index}`,
    isApproved: true,
    maxLockupPeriod: "86400",
    lockupAllowance: "1000000000000000000",
    rateAllowance: "1000000000000000000",
    lockupUsage: "0",
    rateUsage: "0",
    operator: { id: operator, address: operator },
    token: { id: "0x3333333333333333333333333333333333333333", name: "USDFC", symbol: "USDFC", decimals: "18" },
  };
};

// Regression: the dashboard showed only the first ten approvals, so the rest could not be seen or increased.
test("Load more reaches approvals beyond the first page", async ({ page }) => {
  const approvals = Array.from({ length: APPROVAL_COUNT }, (_, index) => approval(index));
  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => {
      const body = route.request().postDataJSON() ?? {};
      const query: string = body.query ?? "";
      if (query.includes("GetAccountApprovals")) {
        const { skip, first } = body.variables;
        return route.fulfill({ json: { data: { operatorApprovals: approvals.slice(skip, skip + first) } } });
      }
      if (query.includes("GetAccountDetails")) {
        const account = { id: "0x1", address: "0x1", totalRails: "0", totalTokens: "0", totalApprovals: "12" };
        return route.fulfill({ json: { data: { accounts: [account] } } });
      }
      return route.fulfill({
        json: { data: { accounts: [], userTokens: [], operatorApprovals: [], accountOperators: [] } },
      });
    },
  );
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );

  await page.goto("/console");
  await loginWithTestAccount(page, { email: "approvals-paging@fake-privy.test" });
  const increaseButtons = page.getByRole("button", { name: "Increase", exact: true });
  await expect(increaseButtons).toHaveCount(10, { timeout: 30_000 });

  await page.getByRole("button", { name: "Load more" }).click();
  await expect(increaseButtons).toHaveCount(APPROVAL_COUNT);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
});
