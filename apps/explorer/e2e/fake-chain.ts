import type { Page, Route } from "@playwright/test";
import {
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  type Hex,
  multicall3Abi,
  parseAbi,
  toFunctionSelector,
} from "viem";

type RpcCall = { id: number; jsonrpc: "2.0"; method: string; params: unknown[] };
type SentTransaction = { from: Hex; to: Hex; data: Hex; hash: Hex };

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const GET_ETH_BALANCE = toFunctionSelector("getEthBalance(address)");
// The setup page reads the epoch with Filecoin Pay's account, to roll its lockup forward.
const getBlockNumberAbi = parseAbi(["function getBlockNumber() view returns (uint256)"]);
const GET_BLOCK_NUMBER = toFunctionSelector(getBlockNumberAbi[0]);
const BALANCE_OF = toFunctionSelector("balanceOf(address)");
// The Deposit dialog resolves a token it is given by address from its own metadata.
const TOKEN_METADATA = {
  [toFunctionSelector("symbol()")]: { functionName: "symbol", result: "USDFC" },
  [toFunctionSelector("name()")]: { functionName: "name", result: "USD for Filecoin Community" },
  [toFunctionSelector("decimals()")]: { functionName: "decimals", result: 18 },
} as const;
const accountsAbi = parseAbi([
  "function accounts(address token, address owner) view returns (uint256 funds, uint256 lockupCurrent, uint256 lockupRate, uint256 lockupLastSettledAt)",
]);
const ACCOUNTS = toFunctionSelector(accountsAbi[0]);
const operatorApprovalsAbi = parseAbi([
  "function operatorApprovals(address token, address client, address operator) view returns (bool isApproved, uint256 rateAllowance, uint256 lockupAllowance, uint256 rateUsage, uint256 lockupUsage, uint256 maxLockupPeriod)",
]);
const OPERATOR_APPROVALS = toFunctionSelector(operatorApprovalsAbi[0]);
// The card purchase checks the recipient's USDC on Base before and after buying.
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const BASE_RPC_HOST = "base-rpc.publicnode.com";
// IFilecoinServiceMetadata, which the explorer reads from operators and validators.
const serviceMetadataAbi = parseAbi([
  "function name() view returns (string)",
  "function description() view returns (string)",
  "function homepage() view returns (string)",
]);
const SERVICE_METADATA = serviceMetadataAbi.map((fn) => toFunctionSelector(fn));
type ServiceMetadata = Partial<Record<(typeof serviceMetadataAbi)[number]["name"], string>>;
// A reverted call inside aggregate3, as from a contract without the interface.
const REVERTED = null;

/**
 * Answers the console's SessionKeyRegistry reads and transaction receipts from what the fake Privy wallet
 * sent (window.__fakePrivyTransactions), so a login approved in the fake dialog shows up "on chain", and reports
 * zero FIL, USDFC, Base USDC, and Filecoin Pay funds for every wallet; a spec can set the wallet's USDFC in
 * window.__fakeUsdfcBalance (base units, as a decimal string). Filecoin Pay reports no operator approved
 * unless a spec lists the operator in window.__fakeApprovedOperators. Batched IFilecoinServiceMetadata reads revert,
 * so a service renders as its address, unless a spec sets that field in window.__fakeServiceMetadata (keyed by
 * lowercase address). Any other RPC call falls through to the route that blocks it (fixtures.ts).
 */
export async function installFakeChain(page: Page): Promise<void> {
  // Imported dynamically: the SDK is ESM-only and Playwright loads specs as CommonJS.
  const { mainnet, calibration } = await import("@filoz/synapse-sdk");
  const registries = [mainnet, calibration].map((chain) => chain.contracts.sessionKeyRegistry);
  const zeroBalanceTokens = [
    ...[mainnet, calibration].map((chain) => chain.contracts.usdfc.address.toLowerCase()),
    BASE_USDC,
  ];
  const paymentsContracts = [mainnet, calibration].map((chain) => chain.contracts.filecoinPay.address.toLowerCase());
  const registryAt = (to: string) => registries.find((r) => r.address.toLowerCase() === to.toLowerCase());
  const abi = registries[0].abi;

  const usdfcTokens = [mainnet, calibration].map((chain) => chain.contracts.usdfc.address.toLowerCase());
  const usdfcBalance = () =>
    page.evaluate(() => BigInt((window as unknown as { __fakeUsdfcBalance?: string }).__fakeUsdfcBalance ?? "0"));

  const approvedOperators = () =>
    page.evaluate(() =>
      ((window as unknown as { __fakeApprovedOperators?: string[] }).__fakeApprovedOperators ?? []).map((a) =>
        a.toLowerCase(),
      ),
    );

  // Read on every batch, so a reload mid-read must not leave the request unanswered: a page that is gone has none.
  const serviceMetadata = () =>
    page
      .evaluate(
        () =>
          (window as unknown as { __fakeServiceMetadata?: Record<string, ServiceMetadata> }).__fakeServiceMetadata ??
          {},
      )
      .catch((): Record<string, ServiceMetadata> => ({}));

  const readApproval = (approved: string[], target: string, data: Hex): Hex | undefined => {
    if (!paymentsContracts.includes(target.toLowerCase()) || !data.startsWith(OPERATOR_APPROVALS)) return undefined;
    const { args } = decodeFunctionData({ abi: operatorApprovalsAbi, data });
    const isApproved = approved.includes(args[2].toLowerCase());
    const limit = isApproved ? 10n ** 18n : 0n;
    return encodeFunctionResult({
      abi: operatorApprovalsAbi,
      functionName: "operatorApprovals",
      result: [isApproved, limit, limit, 0n, 0n, isApproved ? 86400n : 0n],
    });
  };

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

  // The console header's FIL balance (multicall3 getEthBalance) and the known token balances; others reach the guard.
  const readBalance = (target: string, data: Hex, usdfc: bigint): Hex | undefined => {
    if (target.toLowerCase() === MULTICALL3 && data.startsWith(GET_ETH_BALANCE)) {
      return encodeFunctionResult({ abi: multicall3Abi, functionName: "getEthBalance", result: 0n });
    }
    if (target.toLowerCase() === MULTICALL3 && data.startsWith(GET_BLOCK_NUMBER)) {
      return encodeFunctionResult({ abi: getBlockNumberAbi, functionName: "getBlockNumber", result: 1_000_000n });
    }
    const metadata = TOKEN_METADATA[data.slice(0, 10) as keyof typeof TOKEN_METADATA];
    if (metadata && usdfcTokens.includes(target.toLowerCase())) {
      return encodeFunctionResult({
        abi: erc20Abi,
        functionName: metadata.functionName,
        result: metadata.result,
      } as never);
    }
    if (zeroBalanceTokens.includes(target.toLowerCase()) && data.startsWith(BALANCE_OF)) {
      const balance = usdfcTokens.includes(target.toLowerCase()) ? usdfc : 0n;
      return encodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", result: balance });
    }
    if (paymentsContracts.includes(target.toLowerCase()) && data.startsWith(ACCOUNTS)) {
      return encodeFunctionResult({ abi: accountsAbi, functionName: "accounts", result: [0n, 0n, 0n, 0n] });
    }
    return undefined;
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
    if (data.startsWith(OPERATOR_APPROVALS)) return readApproval(await approvedOperators(), to, data);
    if (to.toLowerCase() !== MULTICALL3) return readBalance(to, data, await usdfcBalance());
    const { functionName, args } = decodeFunctionData({ abi: multicall3Abi, data });
    if (functionName !== "aggregate3") return undefined;
    const txs = await sent();
    const approved = await approvedOperators();
    const usdfc = await usdfcBalance();
    const metadata = await serviceMetadata();
    const results = (args[0] as readonly { target: Hex; callData: Hex }[]).map((c) => {
      if (registryAt(c.target)) return readRegistry(txs, c.callData);
      if (c.callData.startsWith(OPERATOR_APPROVALS)) return readApproval(approved, c.target, c.callData);
      const balance = readBalance(c.target, c.callData, usdfc);
      // Token metadata (USDFC's name()) is answered above; any other service has only what a spec gave it.
      const field = serviceMetadataAbi[SERVICE_METADATA.indexOf(c.callData.slice(0, 10) as Hex)]?.name;
      if (balance !== undefined || !field) return balance;
      const value = metadata[c.target.toLowerCase()]?.[field];
      if (value === undefined) return REVERTED;
      return encodeFunctionResult({ abi: serviceMetadataAbi, functionName: field, result: value });
    });
    if (!results.every((r) => r !== undefined)) return undefined;
    return encodeFunctionResult({
      abi: multicall3Abi,
      functionName: "aggregate3",
      result: results.map((returnData) =>
        returnData === REVERTED ? { success: false, returnData: "0x" as const } : { success: true, returnData },
      ),
    });
  };

  await page.route(
    (url) => url.hostname.endsWith("glif.io") || url.hostname === BASE_RPC_HOST,
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

/**
 * Answers the service page's RPC reads: it watches the block number, and its header reads the service's on-chain
 * name, which `operator` (lowercase) does not have.
 */
export async function answerServicePageRpc(page: Page, operator: string): Promise<void> {
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
      if (!calls.every((c) => c.target.toLowerCase() === operator)) return route.fallback();
      const result = encodeFunctionResult({
        abi: multicall3Abi,
        functionName: "aggregate3",
        result: calls.map(() => ({ success: false, returnData: "0x" }) as const),
      });
      return route.fulfill({ json: { jsonrpc: "2.0", id: call.id, result } });
    },
  );
}
