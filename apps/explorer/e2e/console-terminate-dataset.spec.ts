import { decodeFunctionData, encodeFunctionResult, type Hex, multicall3Abi } from "viem";
import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";

const dataSet = (state: "ACTIVE" | "TERMINATED") => ({
  id: "0x0007",
  dataSetId: "7",
  provider: "0x4444444444444444444444444444444444444444",
  totalSize: "0",
  lastWriteAt: String(Math.floor(Date.now() / 1000)),
  pdpRail: {
    paymentRate: "1",
    state,
    endEpoch: state === "TERMINATED" ? "86401" : "0",
    token: { id: "0x3333333333333333333333333333333333333333", symbol: "USDFC", decimals: "18" },
  },
});

test("terminating a dataset sends terminateService and the row shows it ended", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "answers the subgraph and receipt from the fake chain");
  // Imported dynamically: the SDK is ESM-only and Playwright loads specs as CommonJS.
  const { mainnet } = await import("@filoz/synapse-sdk");
  const fwss = mainnet.contracts.fwss;
  const warmStorage = fwss.address.toLowerCase();
  let isTerminated = false;

  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => {
      const query: string = route.request().postDataJSON()?.query ?? "";
      if (query.includes("GetAccountDataSets")) {
        return route.fulfill({ json: { data: { dataSets: [dataSet(isTerminated ? "TERMINATED" : "ACTIVE")] } } });
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
  // The page watches the block number, and the header reads the service's on-chain name, which the fake chain
  // does not know.
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
      if (!calls.every((c) => c.target.toLowerCase() === warmStorage)) return route.fallback();
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

  await page.goto(`/console/services/${warmStorage}`);
  await loginWithTestAccount(page, { email: "terminate-dataset@fake-privy.test" });

  const row = page.getByRole("row").filter({ hasText: "PDP Explorer" });
  await row.getByRole("button", { name: "Terminate" }).click({ timeout: 30_000 });
  const dialog = page.getByRole("dialog", { name: "Terminate dataset #7?" });
  await expect(dialog).toContainText("This cannot be undone.");
  await dialog.getByRole("button", { name: "Terminate dataset" }).click();

  const wallet = page.locator("#privy-dialog");
  await wallet.getByRole("button", { name: "Approve" }).click();
  const sent = await page.waitForFunction(
    () =>
      (window as typeof window & { __fakePrivyTransactions?: { to: string; data: Hex }[] })
        .__fakePrivyTransactions?.[0],
  );
  const tx = (await sent.jsonValue()) as { to: string; data: Hex };
  expect(tx.to.toLowerCase()).toBe(warmStorage);
  const { functionName, args } = decodeFunctionData({ abi: fwss.abi, data: tx.data });
  expect({ functionName, args }).toEqual({ functionName: "terminateService", args: [7n] });

  // The subgraph indexes the termination by the time the receipt's refresh reads it.
  isTerminated = true;
  await wallet.getByRole("button", { name: "All Done" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(row.getByText("Cancelled")).toBeVisible({ timeout: 15_000 });
  await expect(row.getByRole("button", { name: /Terminat/ })).toHaveCount(0);
});
