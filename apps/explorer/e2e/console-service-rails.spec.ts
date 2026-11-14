import { answerServicePageRpc } from "./fake-chain";
import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

const OPERATOR = "0x2222222222222222222222222222222222222222";

const rail = (railId: number) => ({
  id: `rail-${railId}`,
  railId: String(railId),
  state: "ACTIVE",
  paymentRate: "0",
  totalSettledAmount: "0",
  totalOneTimePaymentAmount: "0",
  lockupPeriod: "0",
  settledUpto: "0",
  endEpoch: "0",
  rateChangeQueue: [],
  createdAt: "1700000000",
  payer: { id: "0x1", address: "0x1" },
  payee: { id: "0x4444444444444444444444444444444444444444", address: "0x4444444444444444444444444444444444444444" },
  operator: { id: OPERATOR, address: OPERATOR },
  token: { id: "0x3333333333333333333333333333333333333333", symbol: "USDFC", decimals: "18" },
});

// Regression: page links stopped at 5, so from page 6 on no page was numbered or marked as the current one.
test("rail pagination numbers and marks pages beyond the fifth", async ({ page }) => {
  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => {
      const body = route.request().postDataJSON() ?? {};
      const query: string = body.query ?? "";
      if (query.includes("GetAccountOperatorRails")) {
        const { skip, first } = body.variables;
        const rails = Array.from({ length: first }, (_, index) => rail(skip + index + 1));
        return route.fulfill({ json: { data: { rails } } });
      }
      if (query.includes("GetAccountOperator(")) {
        const accountOperator = {
          id: "service",
          totalRails: "100",
          totalActiveRails: "100",
          totalApprovals: "1",
          totalActiveApprovals: "1",
          operator: { id: OPERATOR, address: OPERATOR },
        };
        return route.fulfill({ json: { data: { accountOperator } } });
      }
      if (query.includes("GetServiceMetrics")) {
        return route.fulfill({ json: { data: { account: null, rails: [], oneTimePayments: [] } } });
      }
      return route.fulfill({ json: { data: { accounts: [], userTokens: [] } } });
    },
  );
  await answerServicePageRpc(page, OPERATOR);
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );

  await page.goto(`/console/services/${OPERATOR}`);
  await loginWithTestAccount(page, { email: "service-rails@fake-privy.test" });
  const pageLinks = page.locator('[data-slot="pagination-link"]:not([aria-label])');
  const currentPage = page.locator('[aria-current="page"]');
  await expect(currentPage).toHaveText("1", { timeout: 30_000 });

  for (let step = 0; step < 5; step++) await page.getByLabel("Go to next page").click();

  await expect(currentPage).toHaveText("6");
  await expect(pageLinks).toHaveText(["4", "5", "6", "7", "8"]);
  await expect(page.getByText("#51", { exact: true })).toBeVisible();
});
