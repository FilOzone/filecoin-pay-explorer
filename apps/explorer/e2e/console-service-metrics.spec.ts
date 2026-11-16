import type { Page } from "@playwright/test";
import { answerServicePageRpc } from "./fake-chain";
import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

const OPERATOR = "0x2222222222222222222222222222222222222222";
const USDFC = { id: "0x3333333333333333333333333333333333333333", symbol: "USDFC", decimals: "18" };
const AXL_USDC = { id: "0x5555555555555555555555555555555555555555", symbol: "axlUSDC", decimals: "6" };
const APPROVED_ONLY = { id: "0x6666666666666666666666666666666666666666", symbol: "UNUSED", decimals: "18" };
const THIRTY_DAYS_IN_EPOCHS = "86400";
const PAGE_SIZE = 1_000;

type SubgraphRequest = { query: string; variables: Record<string, string> };

const userToken = (token: { id: string }, funds: string, lockupRate: string) => ({
  funds,
  lockupCurrent: "0",
  lockupRate,
  lockupLastSettledUntilEpoch: "1",
  lockupLastSettledUntilTimestamp: String(Math.floor(Date.now() / 1_000)),
  token: { id: token.id },
});

const rail = (token: { id: string }, paymentRate: string) => ({
  paymentRate,
  lockupPeriod: THIRTY_DAYS_IN_EPOCHS,
  token: { id: token.id },
});

const payment = (id: string, totalAmount: string) => ({ id, totalAmount, token: { id: USDFC.id } });

/** Answers the service page's reads. `answer` handles the queries a test cares about; others come back empty. */
const stubServicePage = async (page: Page, answer: (request: SubgraphRequest) => unknown | Promise<unknown>) => {
  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    async (route) => {
      const { query = "", variables = {} }: SubgraphRequest = route.request().postDataJSON() ?? {};
      if (query.includes("GetAccountOperator(")) {
        const accountOperator = {
          id: "service",
          totalRails: "3",
          totalActiveRails: "2",
          totalApprovals: "2",
          totalActiveApprovals: "2",
          operator: { id: OPERATOR, address: OPERATOR },
        };
        return route.fulfill({ json: { data: { accountOperator } } });
      }
      const data = (await answer({ query, variables })) ?? { accounts: [], userTokens: [], rails: [], dataSets: [] };
      return route.fulfill({ json: { data } });
    },
  );
  await answerServicePageRpc(page, OPERATOR);
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );
};

const openServicePage = async (page: Page, email: string) => {
  await page.goto(`/console/services/${OPERATOR}`);
  await loginWithTestAccount(page, { email });
  await expect(page.getByRole("heading", { name: "Spend and funding" })).toBeVisible({ timeout: 30_000 });
};

const cellsOf = (page: Page, symbol: string) =>
  page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: symbol, exact: true }) })
    .getByRole("cell");

test("the service page shows each token with something to show on its own row", async ({ page }) => {
  const metricsRequests: Record<string, string>[] = [];

  await stubServicePage(page, ({ query, variables }) => {
    if (query.includes("GetServiceMetrics")) {
      metricsRequests.push(variables);
      return {
        account: {
          operatorApprovals: [
            // More than its one paying rail reserves: a terminated rail's deposit is still locked.
            { lockupUsage: "9640000000000000000", token: USDFC },
            { lockupUsage: "864000", token: AXL_USDC },
            { lockupUsage: "0", token: APPROVED_ONLY },
          ],
          // Runways of 40.5 and 12.5 days at these rates.
          userTokens: [
            userToken(USDFC, "11664000000000000000", "100000000000000"),
            userToken(AXL_USDC, "360000", "10"),
          ],
        },
        rails: [rail(USDFC, "100000000000000"), rail(AXL_USDC, "10")],
        oneTimePayments: [payment("0x01", "420000000000000000")],
      };
    }
    return undefined;
  });

  await openServicePage(page, "service-metrics@fake-privy.test");

  await expect(cellsOf(page, "axlUSDC")).toHaveText([
    "axlUSDC",
    "0.864",
    "0",
    /^0\.864\s*Pays the 30-day notice after you terminate$/,
    /in 12 days$/,
  ]);
  await expect(cellsOf(page, "USDFC")).toHaveText([
    "USDFC",
    "8.640",
    "0.420",
    /^9\.640\s*Pays the 30-day notice after you terminate$/,
    /in 40 days$/,
  ]);
  await expect(page.getByRole("cell", { name: APPROVED_ONLY.symbol, exact: true })).toHaveCount(0);

  expect(metricsRequests[0]?.operator).toBe(OPERATOR);
});

test("the figures that follow a rule explain it on their column header", async ({ page }) => {
  await stubServicePage(page, ({ query }) => {
    if (!query.includes("GetServiceMetrics")) return undefined;
    return {
      account: {
        operatorApprovals: [{ lockupUsage: "8640000000000000000", token: USDFC }],
        userTokens: [userToken(USDFC, "11664000000000000000", "100000000000000")],
      },
      rails: [rail(USDFC, "100000000000000")],
      oneTimePayments: [],
    };
  });

  await openServicePage(page, "service-metrics-hints@fake-privy.test");

  for (const [column, hint] of [
    ["recurring / month", "Rails in their notice period are not included."],
    ["one-time, this month", "since the start of this month in your local time, including fees."],
    ["locked deposit", "A terminated rail's deposit stays here until the rail finalizes."],
  ]) {
    await page.getByRole("button", { name: `Explain ${column}` }).hover();
    await expect(page.locator('[data-slot="tooltip-content"]', { hasText: hint })).toBeVisible();
  }
});

// Regression: at 1200px the console's content column is narrower than the table, which scrolled sideways.
test("the table fits a 1200px window without scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await stubServicePage(page, ({ query }) => {
    if (!query.includes("GetServiceMetrics")) return undefined;
    return {
      account: {
        operatorApprovals: [{ lockupUsage: "2292000000000000000", token: USDFC }],
        // A runway of about 108 days, so the date and its countdown are at their usual widest.
        userTokens: [userToken(USDFC, "31200000000000000000", "100000000000000")],
      },
      rails: [rail(USDFC, "100000000000000")],
      oneTimePayments: [payment("0x01", "420000000000000000")],
    };
  });

  await openServicePage(page, "service-metrics-width@fake-privy.test");
  await expect(cellsOf(page, "USDFC").nth(4)).toHaveText(/in 108 days$/);

  const container = page.locator('[data-slot="table-container"]', {
    has: page.getByRole("columnheader", { name: /Locked deposit/ }),
  });
  expect(await container.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
});

test("a busy pair sees its figures before its one-time total finishes loading", async ({ page }) => {
  let finishWalk = () => {};
  const walkFinished = new Promise<void>((resolve) => {
    finishWalk = resolve;
  });
  const fullPage = Array.from({ length: PAGE_SIZE }, (_, index) =>
    payment(`0x${String(index).padStart(6, "0")}`, "1000000000000000"),
  );

  await stubServicePage(page, async ({ query, variables }) => {
    if (query.includes("GetServiceMetrics")) {
      return {
        account: {
          operatorApprovals: [{ lockupUsage: "8640000000000000000", token: USDFC }],
          userTokens: [userToken(USDFC, "11664000000000000000", "100000000000000")],
        },
        rails: [rail(USDFC, "100000000000000")],
        oneTimePayments: fullPage,
      };
    }
    if (query.includes("GetSubgraphBlock")) return { _meta: { block: { number: 1 } } };
    if (query.includes("GetServiceOneTimePayments")) {
      await walkFinished;
      return { oneTimePayments: variables.cursor === "0x" ? fullPage : fullPage.slice(0, 5) };
    }
    return undefined;
  });

  await openServicePage(page, "service-metrics-busy@fake-privy.test");

  await expect(cellsOf(page, "USDFC").nth(1)).toHaveText("8.640");
  await expect(cellsOf(page, "USDFC").nth(2)).toHaveText("Loading...");

  finishWalk();

  await expect(cellsOf(page, "USDFC").nth(2)).toHaveText("1.005");
});
