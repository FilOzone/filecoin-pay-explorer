import type { Page, Route } from "@playwright/test";
import { decodeFunctionData, encodeFunctionResult, type Hex, multicall3Abi } from "viem";

type RpcCall = { id: number; jsonrpc: "2.0"; method: string; params: unknown[] };
type SentTransaction = { from: Hex; to: Hex; data: Hex; hash: Hex };

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";

/**
 * Answers the console's SessionKeyRegistry reads and transaction receipts from what the fake Privy wallet
 * sent (window.__fakePrivyTransactions), so a login approved in the fake dialog shows up "on chain".
 * Every other RPC call still reaches the network.
 */
export async function installFakeChain(page: Page): Promise<void> {
  // Imported dynamically: the SDK is ESM-only and Playwright loads specs as CommonJS.
  const { mainnet, calibration } = await import("@filoz/synapse-sdk");
  const registries = [mainnet, calibration].map((chain) => chain.contracts.sessionKeyRegistry);
  const registryAt = (to: string) => registries.find((r) => r.address.toLowerCase() === to.toLowerCase());
  const abi = registries[0].abi;

  const sent = () =>
    page.evaluate(
      () => (window as unknown as { __fakePrivyTransactions?: SentTransaction[] }).__fakePrivyTransactions ?? [],
    );

  const expiryOf = (txs: SentTransaction[], user: string, signer: string, permission: string): bigint => {
    let expiry = 0n;
    for (const tx of txs) {
      if (!registryAt(tx.to)) continue;
      const { functionName, args } = decodeFunctionData({ abi, data: tx.data });
      if (functionName !== "login" || tx.from.toLowerCase() !== user.toLowerCase()) continue;
      const [loginSigner, loginExpiry, permissions] = args as [Hex, bigint, Hex[], string];
      if (loginSigner.toLowerCase() === signer.toLowerCase() && permissions.includes(permission as Hex)) {
        expiry = loginExpiry;
      }
    }
    return expiry;
  };

  const readRegistry = (txs: SentTransaction[], data: Hex): Hex | undefined => {
    const { functionName, args } = decodeFunctionData({ abi, data });
    if (functionName !== "authorizationExpiry") return undefined;
    const [user, signer, permission] = args as [Hex, Hex, Hex];
    return encodeFunctionResult({ abi, functionName, result: expiryOf(txs, user, signer, permission) });
  };

  const answer = async (call: RpcCall): Promise<unknown> => {
    if (call.method === "eth_getTransactionReceipt") {
      const tx = (await sent()).find((t) => t.hash === call.params[0]);
      if (!tx) return undefined;
      return {
        transactionHash: tx.hash,
        transactionIndex: "0x0",
        blockHash: tx.hash,
        blockNumber: "0x1",
        from: tx.from,
        to: tx.to,
        cumulativeGasUsed: "0x0",
        gasUsed: "0x0",
        effectiveGasPrice: "0x0",
        contractAddress: null,
        logs: [],
        logsBloom: `0x${"0".repeat(512)}`,
        status: "0x1",
        type: "0x2",
      };
    }
    if (call.method !== "eth_call") return undefined;
    const { to, data } = call.params[0] as { to: string; data: Hex };
    if (registryAt(to)) return readRegistry(await sent(), data);
    if (to.toLowerCase() !== MULTICALL3) return undefined;
    const { functionName, args } = decodeFunctionData({ abi: multicall3Abi, data });
    if (functionName !== "aggregate3") return undefined;
    const calls = args[0] as readonly { target: Hex; callData: Hex }[];
    if (!calls.every((c) => registryAt(c.target))) return undefined;
    const txs = await sent();
    const results = calls.map((c) => ({ success: true, returnData: readRegistry(txs, c.callData) ?? "0x" }));
    return encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", result: results });
  };

  await page.route(
    (url) => url.hostname.endsWith("glif.io"),
    async (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? "null") as RpcCall | RpcCall[] | null;
      if (!body) return route.fallback();
      const calls = Array.isArray(body) ? body : [body];
      const results = await Promise.all(calls.map(answer));
      if (results.some((r) => r === undefined)) return route.fallback();
      const replies = calls.map((c, i) => ({ jsonrpc: "2.0", id: c.id, result: results[i] }));
      return route.fulfill({ json: Array.isArray(body) ? replies : replies[0] });
    },
  );
}
