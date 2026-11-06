import { answerServicePageRpc } from "./fake-chain";
import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

const LAST_WRITE_AT = String(Math.floor(Date.now() / 1000) - 60 * 86_400);

// Dataset 1 pays the most, so the queue ranks them 1 to 12 and dataset 11 lands on page 2.
const staleDataSet = (dataSetId: number) => ({
  id: `0x${dataSetId.toString(16).padStart(4, "0")}`,
  dataSetId: String(dataSetId),
  provider: "0x4444444444444444444444444444444444444444",
  totalSize: "0",
  lastWriteAt: LAST_WRITE_AT,
  pdpRail: {
    paymentRate: String(13 - dataSetId),
    state: "ACTIVE",
    endEpoch: "0",
    token: { id: "0x3333333333333333333333333333333333333333", symbol: "USDFC", decimals: "18" },
  },
});

test("an inactivity email link opens the queue on its dataset's page, scrolled to and marking that row", async ({
  page,
}) => {
  // Imported dynamically: the SDK is ESM-only and Playwright loads specs as CommonJS.
  const { mainnet } = await import("@filoz/synapse-sdk");
  const warmStorage = mainnet.contracts.fwss.address.toLowerCase();

  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => {
      const query: string = route.request().postDataJSON()?.query ?? "";
      if (query.includes("GetStaleDataSets")) {
        return route.fulfill({
          json: { data: { dataSets: Array.from({ length: 12 }, (_, i) => staleDataSet(i + 1)) } },
        });
      }
      if (query.includes("GetAccountOperator(")) {
        const accountOperator = {
          id: "service",
          totalRails: "0",
          totalActiveRails: "0",
          totalApprovals: "1",
          totalActiveApprovals: "1",
          operator: { id: warmStorage, address: warmStorage },
        };
        return route.fulfill({ json: { data: { accountOperator } } });
      }
      return route.fulfill({ json: { data: { accounts: [], userTokens: [], rails: [], dataSets: [] } } });
    },
  );
  await answerServicePageRpc(page, warmStorage);
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );

  await page.goto(`/console/services/${warmStorage}?dataset=11#stale`);
  await loginWithTestAccount(page, { email: "stale-queue@fake-privy.test" });

  const linkedRow = page.locator("#stale-dataset-11");
  await expect(linkedRow).toHaveAttribute("aria-current", "true", { timeout: 30_000 });
  await expect(linkedRow).toBeInViewport();
  await expect(page.locator("#stale-dataset-1")).toHaveCount(0);
});
