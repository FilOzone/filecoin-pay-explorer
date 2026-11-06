import type { Page } from "@playwright/test";
import { decodeFunctionData, encodeFunctionResult, type Hex, multicall3Abi } from "viem";
import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";

const dataSet = (state: "ACTIVE" | "TERMINATED", lastWriteAt = Math.floor(Date.now() / 1000)) => ({
  id: "0x0007",
  dataSetId: "7",
  provider: "0x4444444444444444444444444444444444444444",
  totalSize: "0",
  lastWriteAt: String(lastWriteAt),
  pdpRail: {
    paymentRate: "1",
    state,
    endEpoch: state === "TERMINATED" ? "86401" : "0",
    token: { id: "0x3333333333333333333333333333333333333333", symbol: "USDFC", decimals: "18" },
  },
});

interface FakeConsole {
  dataSets: ReturnType<typeof dataSet>[];
  staleDataSets: ReturnType<typeof dataSet>[];
  blockNumber: number;
  /** The receipt read waits on this, so the transaction stays pending until it resolves. */
  receiptHeld: Promise<void>;
}

/** Opens the Warm Storage service page, answering the subgraph and chain from `state`. */
async function openServicePage(page: Page, state: FakeConsole, email: string) {
  // Imported dynamically: the SDK is ESM-only and Playwright loads specs as CommonJS.
  const { mainnet } = await import("@filoz/synapse-sdk");
  const warmStorage = mainnet.contracts.fwss.address.toLowerCase();

  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => {
      const query: string = route.request().postDataJSON()?.query ?? "";
      if (query.includes("GetAccountDataSets")) {
        return route.fulfill({ json: { data: { dataSets: state.dataSets } } });
      }
      if (query.includes("GetStaleDataSets")) {
        return route.fulfill({ json: { data: { dataSets: state.staleDataSets } } });
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
    async (route) => {
      const call = route.request().postDataJSON();
      if (call?.method === "eth_blockNumber") {
        // Each poll sees a new block, as the chain does.
        state.blockNumber += 1;
        return route.fulfill({ json: { jsonrpc: "2.0", id: call.id, result: `0x${state.blockNumber.toString(16)}` } });
      }
      if (call?.method === "eth_getTransactionReceipt") {
        await state.receiptHeld;
        return route.fallback();
      }
      const { to, data } = call?.params?.[0] ?? {};
      if (call?.method !== "eth_call" || to?.toLowerCase() !== MULTICALL3) return route.fallback();
      const decoded = decodeFunctionData({ abi: multicall3Abi, data });
      if (decoded.functionName !== "aggregate3") return route.fallback();
      const [calls] = decoded.args;
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
  await loginWithTestAccount(page, { email });
  return warmStorage;
}

test("terminating a dataset sends terminateService and the row shows it ended", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "answers the subgraph and receipt from the fake chain");
  const { fwss } = await import("@filoz/synapse-core/abis");
  const state: FakeConsole = {
    dataSets: [dataSet("ACTIVE")],
    staleDataSets: [],
    blockNumber: 0,
    receiptHeld: Promise.resolve(),
  };
  const warmStorage = await openServicePage(page, state, "terminate-dataset@fake-privy.test");

  const row = page.getByRole("row").filter({ hasText: "PDP Explorer" });
  await row.getByRole("button", { name: "Terminate" }).click({ timeout: 30_000 });
  const dialog = page.getByRole("dialog", { name: "Terminate data set #7?" });
  await expect(dialog).toContainText("This cannot be undone.");
  // Regression: each new block rebuilt the table's columns, remounting the action cell and closing the dialog.
  const openedAtBlock = state.blockNumber;
  await expect.poll(() => state.blockNumber, { timeout: 20_000 }).toBeGreaterThan(openedAtBlock + 1);
  // The dialog element itself is a zero-height wrapper, so check what it shows.
  await expect(dialog.getByRole("heading", { name: "Terminate data set #7?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Terminate data set" }).click();

  const wallet = page.locator("#privy-dialog");
  await wallet.getByRole("button", { name: "Approve" }).click();
  const sent = await page.waitForFunction(
    () =>
      (window as typeof window & { __fakePrivyTransactions?: { to: string; data: Hex }[] })
        .__fakePrivyTransactions?.[0],
  );
  const tx = await sent.jsonValue();
  if (!tx) throw new Error("No transaction was sent");
  expect(tx.to.toLowerCase()).toBe(warmStorage);
  const { functionName, args } = decodeFunctionData({ abi: fwss, data: tx.data });
  expect({ functionName, args }).toEqual({ functionName: "terminateService", args: [7n, "0x"] });

  // The subgraph indexes the termination by the time the receipt's refresh reads it.
  state.dataSets = [dataSet("TERMINATED")];
  await wallet.getByRole("button", { name: "All Done" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(row.getByText("Cancelled")).toBeVisible({ timeout: 15_000 });
  await expect(row.getByRole("button", { name: /Terminat/ })).toHaveCount(0);
});

test("a termination started in the stale queue also locks the data set's table row", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "answers the subgraph and receipt from the fake chain");
  const stale = dataSet("ACTIVE", Math.floor(Date.now() / 1000) - 60 * 86_400);
  // The subgraph stays behind throughout, so only the shared state can lock the buttons.
  const receipt = Promise.withResolvers<void>();
  const state: FakeConsole = {
    dataSets: [stale],
    staleDataSets: [stale],
    blockNumber: 0,
    receiptHeld: receipt.promise,
  };
  await openServicePage(page, state, "terminate-dataset-queue@fake-privy.test");

  const queueRow = page.locator("#stale-dataset-7");
  const tableRow = page.getByRole("row").filter({ hasText: "PDP Explorer" });
  await expect(tableRow.getByRole("button", { name: "Terminate" })).toBeEnabled({ timeout: 30_000 });
  await queueRow.getByRole("button", { name: "Terminate" }).click({ timeout: 30_000 });
  const dialog = page.getByRole("dialog", { name: "Terminate data set #7?" });
  await dialog.getByRole("button", { name: "Terminate data set" }).click();

  const wallet = page.locator("#privy-dialog");
  await wallet.getByRole("button", { name: "Approve" }).click();
  await wallet.getByRole("button", { name: "All Done" }).click();
  await dialog.getByRole("button", { name: "Close" }).click();

  await expect(queueRow.getByRole("button", { name: "Terminating…" })).toBeDisabled();
  await expect(tableRow.getByRole("button", { name: "Terminating…" })).toBeDisabled();

  receipt.resolve();

  await expect(queueRow.getByRole("button", { name: "Terminated" })).toBeDisabled({ timeout: 15_000 });
  await expect(tableRow.getByRole("button", { name: "Terminated" })).toBeDisabled();
});
