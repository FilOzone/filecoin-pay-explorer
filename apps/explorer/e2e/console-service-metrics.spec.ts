import { decodeFunctionData, encodeFunctionResult, multicall3Abi } from "viem";
import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

const OPERATOR = "0x2222222222222222222222222222222222222222";
const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const USDFC = { id: "0x3333333333333333333333333333333333333333", symbol: "USDFC", decimals: "18" };
const AXL_USDC = { id: "0x5555555555555555555555555555555555555555", symbol: "axlUSDC", decimals: "6" };
const THIRTY_DAYS_IN_EPOCHS = "86400";

test("the service page shows each token's metrics from one request", async ({ page }) => {
  const now = String(Math.floor(Date.now() / 1_000));
  const metricsRequests: { operator: string; monthStart: string }[] = [];

  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => {
      const body = route.request().postDataJSON() ?? {};
      const query: string = body.query ?? "";
      if (query.includes("GetServiceMetrics")) {
        metricsRequests.push(body.variables);
        const userToken = (token: { id: string }, funds: string, lockupRate: string) => ({
          funds,
          lockupCurrent: "0",
          lockupRate,
          lockupLastSettledUntilEpoch: "1",
          lockupLastSettledUntilTimestamp: now,
          token: { id: token.id },
        });
        const rail = (token: { id: string }, paymentRate: string) => ({
          paymentRate,
          lockupPeriod: THIRTY_DAYS_IN_EPOCHS,
          token: { id: token.id },
        });
        return route.fulfill({
          json: {
            data: {
              account: {
                operatorApprovals: [
                  // More than its one paying rail reserves: a terminated rail's deposit is still locked.
                  { lockupUsage: "9640000000000000000", token: USDFC },
                  { lockupUsage: "864000", token: AXL_USDC },
                ],
                // Runways of 40.5 and 12.5 days at these rates.
                userTokens: [
                  userToken(USDFC, "11664000000000000000", "100000000000000"),
                  userToken(AXL_USDC, "360000", "10"),
                ],
              },
              rails: [rail(USDFC, "100000000000000"), rail(AXL_USDC, "10")],
              oneTimePayments: [{ totalAmount: "420000000000000000", token: { id: USDFC.id } }],
            },
          },
        });
      }
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
      return route.fulfill({ json: { data: { accounts: [], userTokens: [], rails: [], dataSets: [] } } });
    },
  );
  // The rail table watches the block number, and the header reads the service's on-chain name, which this
  // operator does not have.
  await page.route(
    (url) => url.hostname.endsWith("glif.io"),
    (route) => {
      const call = route.request().postDataJSON();
      if (call?.method === "eth_blockNumber")
        return route.fulfill({ json: { jsonrpc: "2.0", id: call.id, result: "0x1" } });
      const { to, data } = call?.params?.[0] ?? {};
      if (call?.method !== "eth_call" || to?.toLowerCase() !== MULTICALL3) return route.fallback();
      const { args } = decodeFunctionData({ abi: multicall3Abi, data });
      const calls = args[0] as readonly { target: string }[];
      if (!calls.every((c) => c.target.toLowerCase() === OPERATOR)) return route.fallback();
      const result = encodeFunctionResult({
        abi: multicall3Abi,
        functionName: "aggregate3",
        result: calls.map(() => ({ success: false, returnData: "0x" }) as const),
      });
      return route.fulfill({ json: { jsonrpc: "2.0", id: call.id, result } });
    },
  );
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );

  await page.goto(`/console/services/${OPERATOR}`);
  await loginWithTestAccount(page, { email: "service-metrics@fake-privy.test" });

  await expect(page.getByRole("heading", { name: "Spend and funding" })).toBeVisible({ timeout: 30_000 });

  const cellsOf = (symbol: string) =>
    page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: symbol, exact: true }) })
      .getByRole("cell");

  await expect(cellsOf("axlUSDC")).toHaveText([
    "axlUSDC",
    "0.864",
    "0",
    /^0\.864\s*Pays the 30-day notice after you terminate$/,
    /\(in 12 days\)$/,
  ]);
  await expect(cellsOf("USDFC")).toHaveText([
    "USDFC",
    "8.640",
    "0.420",
    /^9\.640\s*Pays the 30-day notice after you terminate$/,
    /\(in 40 days\)$/,
  ]);

  expect(metricsRequests[0].operator).toBe(OPERATOR);
  const monthStart = new Date(Number(metricsRequests[0].monthStart) * 1_000);
  expect(monthStart.getDate()).toBe(1);
  expect(monthStart.getMonth()).toBe(new Date().getMonth());
});
