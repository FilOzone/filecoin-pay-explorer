import type { Page, Route } from "@playwright/test";
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  erc20Abi,
  type Hex,
  multicall3Abi,
  numberToHex,
  parseAbi,
  toFunctionSelector,
} from "viem";
import { quoterAbi } from "./fake-usdc-gas";

type RpcCall = { id: number; jsonrpc: "2.0"; method: string; params: unknown[] };
type SentTransaction = { from: Hex; to: Hex; data?: Hex; hash: Hex };
type SquidRouteRequest = { fromAddress: Hex; toAddress: Hex; fromChain: string; fromAmount: string };

const BASE_CHAIN_ID = 8453;
const BASE_RPC_HOST = "base-rpc.publicnode.com";
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const GAS_PRICE_ORACLE = "0x420000000000000000000000000000000000000f";
const AGGREGATE3 = toFunctionSelector("aggregate3((address,bool,bytes)[])");
const GET_ETH_BALANCE = toFunctionSelector("getEthBalance(address)");
const GET_L1_FEE = toFunctionSelector("getL1Fee(bytes)");
const SQUID_API_HOST = "v2.api.squidrouter.com";
const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const SQUID_ROUTER = "0xce16f69375520ab01377ce7b88f5ba8c48f8d666";
const SUSHI_QUOTER = "0x3b9e156e93146b10551840701337b1c5356b1a98";
const DESTINATION_HASH = `0x${"de".repeat(32)}` as const;
// viem only multicalls at blocks after Multicall3 was deployed on Base.
const BASE_BLOCK = 30_000_000n;
const PAYER_USDC = 100_000_000n;
const PAYER_ETH = 10n ** 18n;
const GAS_PRICE = 1_000_000n;

const paymentsAbi = parseAbi([
  "function accounts(address token, address owner) view returns (uint256 funds, uint256 lockupCurrent, uint256 lockupRate, uint256 lockupLastSettledAt)",
  "event DepositRecorded(address indexed token, address indexed from, address indexed to, uint256 amount)",
]);

/**
 * Squid on Base for one funded payer: the token catalog, quotes and routes that echo the request, a status that
 * reports success, and the Filecoin deposit receipt that credits the route's recipient. Other RPC calls fall
 * through to fake-chain.ts. `executableRoute` adjusts the nth executable route (from 1): a minimum received below
 * the quotes', or an expiry. Returns the route requests Squid received, in order.
 */
export async function installFakeSquid(
  page: Page,
  payer: Hex,
  // The bridge fee is the route's native `value`, as Axelar's fee is on a real route.
  {
    executableRoute = () => ({}),
    payerEth = PAYER_ETH,
    nativeFee = 0n,
    alsoRead,
  }: {
    executableRoute?: (n: number) => { minimumShortfall?: bigint; expiresInSeconds?: number };
    payerEth?: bigint;
    nativeFee?: bigint;
    /** Another fake's reads, so a batched multicall mixing both is still answered. */
    alsoRead?: (target: string, data: Hex) => Hex | undefined;
  } = {},
): Promise<SquidRouteRequest[]> {
  // Imported dynamically: the SDK is ESM-only and Playwright loads specs as CommonJS.
  const { mainnet } = await import("@filoz/synapse-sdk");
  const payments = mainnet.contracts.filecoinPay.address.toLowerCase();
  const usdfc = mainnet.contracts.usdfc.address;
  const routeRequests: SquidRouteRequest[] = [];
  let executableRoutes = 0;
  const isPayer = (address: string) => address.toLowerCase() === payer.toLowerCase();

  const sent = () =>
    page.evaluate(
      () => (window as unknown as { __fakePrivyTransactions?: SentTransaction[] }).__fakePrivyTransactions ?? [],
    );

  // The router allowance is whatever the payer's last USDC approval set.
  const allowance = (txs: SentTransaction[], owner: string): bigint => {
    let amount = 0n;
    for (const tx of txs) {
      if (!isPayer(tx.from) || !isPayer(owner) || tx.to.toLowerCase() !== BASE_USDC || !tx.data) continue;
      const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: tx.data });
      if (functionName === "approve") amount = args[1] as bigint;
    }
    return amount;
  };

  const readUsdc = (txs: SentTransaction[], data: Hex): Hex | undefined => {
    const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data });
    if (functionName === "balanceOf") {
      const result = isPayer(args[0] as string) ? PAYER_USDC : 0n;
      return encodeFunctionResult({ abi: erc20Abi, functionName, result });
    }
    if (functionName === "allowance") {
      return encodeFunctionResult({ abi: erc20Abi, functionName, result: allowance(txs, args[0] as string) });
    }
    return undefined;
  };

  const readBase = (txs: SentTransaction[], target: string, data: Hex): Hex | undefined => {
    const other = alsoRead?.(target, data);
    if (other !== undefined) return other;
    if (target.toLowerCase() === BASE_USDC) return readUsdc(txs, data);
    if (target.toLowerCase() === MULTICALL3 && data.startsWith(GET_ETH_BALANCE)) {
      const [owner] = decodeAbiParameters([{ type: "address" }], `0x${data.slice(10)}`);
      return encodeAbiParameters([{ type: "uint256" }], [isPayer(owner) ? payerEth : 0n]);
    }
    // OP Stack chains add an L1 data fee to each transaction.
    if (target.toLowerCase() === GAS_PRICE_ORACLE && data.startsWith(GET_L1_FEE)) {
      return encodeAbiParameters([{ type: "uint256" }], [GAS_PRICE]);
    }
    return undefined;
  };

  const answerBase = async (call: RpcCall): Promise<unknown> => {
    switch (call.method) {
      case "eth_chainId":
        return numberToHex(BASE_CHAIN_ID);
      case "eth_blockNumber":
        return numberToHex(BASE_BLOCK + BigInt((await sent()).length));
      case "eth_getBalance":
        return numberToHex(isPayer(call.params[0] as string) ? payerEth : 0n);
      case "eth_gasPrice":
      case "eth_maxPriorityFeePerGas":
        return numberToHex(GAS_PRICE);
      case "eth_estimateGas":
        return numberToHex(100_000n);
      case "eth_getTransactionCount":
        return numberToHex((await sent()).filter((tx) => isPayer(tx.from)).length);
      case "eth_getBlockByNumber":
        return {
          number: numberToHex(BASE_BLOCK + BigInt((await sent()).length)),
          hash: `0x${"0b".repeat(32)}`,
          timestamp: numberToHex(Math.floor(Date.now() / 1000)),
          baseFeePerGas: numberToHex(GAS_PRICE),
          gasLimit: numberToHex(30_000_000n),
          gasUsed: "0x0",
          transactions: [],
        };
      case "eth_call": {
        const { to, data } = call.params[0] as { to: string; data: Hex };
        const txs = await sent();
        if (to.toLowerCase() !== MULTICALL3 || !data.startsWith(AGGREGATE3)) return readBase(txs, to, data);
        const { args } = decodeFunctionData({ abi: multicall3Abi, data });
        const calls = args[0] as readonly { target: Hex; callData: Hex }[];
        const results = calls.map((c) => readBase(txs, c.target, c.callData));
        if (!results.every((r): r is Hex => r !== undefined)) return undefined;
        return encodeFunctionResult({
          abi: multicall3Abi,
          functionName: "aggregate3",
          result: results.map((returnData) => ({ success: true, returnData })),
        });
      }
      default:
        return undefined;
    }
  };

  // Squid delivers to the recipient of the last route, which the deposit event credits.
  const depositReceipt = () => {
    const route = routeRequests.at(-1);
    if (!route) return undefined;
    return {
      transactionHash: DESTINATION_HASH,
      transactionIndex: "0x0",
      blockHash: DESTINATION_HASH,
      blockNumber: "0x1",
      from: SQUID_ROUTER,
      to: payments,
      cumulativeGasUsed: "0x0",
      gasUsed: "0x0",
      effectiveGasPrice: "0x0",
      contractAddress: null,
      logs: [
        {
          address: payments,
          topics: encodeEventTopics({
            abi: paymentsAbi,
            eventName: "DepositRecorded",
            args: { token: usdfc, from: SQUID_ROUTER, to: route.toAddress },
          }),
          data: encodeAbiParameters([{ type: "uint256" }], [BigInt(route.fromAmount) * 10n ** 12n]),
          blockNumber: "0x1",
          blockHash: DESTINATION_HASH,
          transactionHash: DESTINATION_HASH,
          transactionIndex: "0x0",
          logIndex: "0x0",
          removed: false,
        },
      ],
      logsBloom: `0x${"0".repeat(512)}`,
      status: "0x1",
      type: "0x2",
    };
  };

  // An empty Filecoin Pay account; the deposit is verified from its receipt event.
  const readPayments = (target: string, data: Hex): Hex | undefined => {
    if (target.toLowerCase() !== payments) return undefined;
    const { functionName } = decodeFunctionData({ abi: paymentsAbi, data });
    if (functionName !== "accounts") return undefined;
    return encodeFunctionResult({ abi: paymentsAbi, functionName, result: [0n, 0n, 0n, 0n] });
  };

  const answerFilecoin = (call: RpcCall): unknown => {
    if (call.method === "eth_getTransactionReceipt" && call.params[0] === DESTINATION_HASH) return depositReceipt();
    if (call.method !== "eth_call") return undefined;
    const { to, data } = call.params[0] as { to: string; data: Hex };
    // The FIL top-up's price: 1 WFIL buys 5 USDFC.
    if (to.toLowerCase() === SUSHI_QUOTER) {
      const { args } = decodeFunctionData({ abi: quoterAbi, data });
      return encodeFunctionResult({
        abi: quoterAbi,
        functionName: "quoteExactOutputSingle",
        result: [args[0].amount * 5n, 0n, 0, 0n],
      });
    }
    if (to.toLowerCase() !== MULTICALL3) return readPayments(to, data);
    const { functionName, args } = decodeFunctionData({ abi: multicall3Abi, data });
    if (functionName !== "aggregate3") return undefined;
    const results = (args[0] as readonly { target: Hex; callData: Hex }[]).map((c) =>
      readPayments(c.target, c.callData),
    );
    if (!results.every((r): r is Hex => r !== undefined)) return undefined;
    return encodeFunctionResult({
      abi: multicall3Abi,
      functionName: "aggregate3",
      result: results.map((returnData) => ({ success: true, returnData })),
    });
  };

  const answerRpc = (answer: (call: RpcCall) => unknown) => async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? "null") as RpcCall | RpcCall[] | null;
    if (!body) return route.fallback();
    const calls = Array.isArray(body) ? body : [body];
    const results = await Promise.all(calls.map(answer));
    if (results.some((r) => r === undefined)) return route.fallback();
    const replies = calls.map((c, i) => ({ jsonrpc: "2.0", id: c.id, result: results[i] }));
    return route.fulfill({ json: Array.isArray(body) ? replies : replies[0] });
  };
  await page.route((url) => url.hostname === BASE_RPC_HOST, answerRpc(answerBase));
  await page.route((url) => url.hostname.endsWith("glif.io"), answerRpc(answerFilecoin));

  await page.route("**/api/squid/tokens", (route) =>
    route.fulfill({
      json: { tokens: [{ chainId: String(BASE_CHAIN_ID), address: BASE_USDC, symbol: "USDC", decimals: 6 }] },
    }),
  );
  await page.route(
    (url) => url.hostname === SQUID_API_HOST,
    (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/status")) {
        return route.fulfill({
          json: { squidTransactionStatus: "success", toChain: { transactionId: DESTINATION_HASH } },
        });
      }
      if (!url.pathname.endsWith("/route")) return route.fallback();
      const params = route.request().postDataJSON() as SquidRouteRequest & { quoteOnly: boolean };
      routeRequests.push(params);
      const { minimumShortfall = 0n, expiresInSeconds } = params.quoteOnly ? {} : executableRoute(++executableRoutes);
      // 1 USDC buys 1 USDFC, 6 decimals to 18.
      const toAmount = (BigInt(params.fromAmount) * 10n ** 12n).toString();
      return route.fulfill({
        json: {
          route: {
            quoteId: `fake-quote-${routeRequests.length}`,
            params,
            estimate: {
              toAmount,
              toAmountMin: (BigInt(toAmount) - minimumShortfall).toString(),
              actions: [{ type: "custom", toChain: "314", provider: "Filecoin Pay" }],
              feeCosts:
                nativeFee === 0n
                  ? []
                  : [
                      {
                        name: "Gas receiver fee",
                        amount: nativeFee.toString(),
                        token: { address: NATIVE_TOKEN, chainId: String(BASE_CHAIN_ID), symbol: "ETH", decimals: 18 },
                      },
                    ],
              // Squid prices the route's source gas; the review budgets the route from it.
              gasCosts: [
                {
                  type: "executeCall",
                  amount: "1000000000000000",
                  gasLimit: "500000",
                  token: { address: NATIVE_TOKEN, chainId: String(BASE_CHAIN_ID), symbol: "ETH", decimals: 18 },
                },
              ],
            },
            transactionRequest: {
              target: SQUID_ROUTER,
              data: "0x12345678",
              value: nativeFee.toString(),
              gasLimit: "500000",
              ...(expiresInSeconds === undefined
                ? {}
                : { expiry: String(Math.floor(Date.now() / 1000) + expiresInSeconds) }),
            },
          },
        },
      });
    },
  );
  return routeRequests;
}
