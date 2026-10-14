import type { Page, Route } from "@playwright/test";
import {
  concat,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  erc20Abi,
  type Hex,
  multicall3Abi,
  numberToHex,
  pad,
  parseAbi,
  recoverAddress,
  toEventSelector,
  toFunctionSelector,
} from "viem";
import {
  entryPoint08Abi,
  formatUserOperation,
  getUserOperationHash,
  type RpcUserOperation,
  type UserOperation,
} from "viem/account-abstraction";
import { recoverAuthorizationAddress } from "viem/utils";

type RpcCall = { id: number | string; jsonrpc: "2.0"; method: string; params: unknown[] };
type RpcAuthorization = { address: Hex; chainId: Hex; nonce: Hex; r: Hex; s: Hex; yParity: Hex };

// Written out rather than imported from the app, so a wrong address in the app fails the spec.
const BASE_CHAIN_ID = 8453;
const BASE_RPC_HOST = "base-rpc.publicnode.com";
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const AGGREGATE3 = toFunctionSelector("aggregate3((address,bool,bytes)[])");
const ENTRY_POINT = "0x4337084d9e255ff0702461cf8895ce9e3b5ff108";
const PAYMASTER = "0x0578cfb241215b77442a541325d6a4e6dfe700ec";
const QUOTER = "0x3d4e44eb1374240ce5f1b871ab261cd16335b76a";
const SIMPLE_7702_ACCOUNT = "0xe6cae83bde06e4c305530e199d7217f42808555b";
const OTHER_DELEGATE = "0x1111111111111111111111111111111111111111";
const BUNDLER = "0x4337000c2828f5260d8921fd25829f606b9e8680";
const ADDITIONAL_GAS_CHARGE = 35_000n;
/** USDC base units for 1 ETH, for both the paymaster's oracle and the pool. */
export const FAKE_ETH_PRICE = 2_500_000_000n;
const GAS_PRICE = 1_000_000n;
/** The USDC the paymaster keeps for each included operation, as its UserOperationSponsored event reports. */
export const FAKE_CHARGED_USDC = 21_500n;

const paymasterAbi = parseAbi([
  "function additionalGasCharge() view returns (uint32)",
  "function feeSpread() view returns (uint32)",
  "function fetchPrice() view returns (uint256)",
]);
const quoterAbi = parseAbi([
  "struct QuoteExactOutputSingleParams { address tokenIn; address tokenOut; uint256 amount; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactOutputSingle(QuoteExactOutputSingleParams params) returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
const permitAbi = parseAbi([
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function nonces(address owner) view returns (uint256)",
]);
/** The payer's USDC, as fake-squid.ts funds it; the executor reads it in one batch with the permit state. */
const PAYER_USDC = 100_000_000n;

/**
 * What the bundler does with the next operation sent: include it (`included`), include it with the batch reverted
 * (`reverted`), refuse it at validation (`rejected`), or accept it and never report a receipt (`unresolved`).
 */
export type FakeOperationOutcome = "included" | "reverted" | "rejected" | "unresolved";
export type FakeDelegation = "none" | "ours" | "conflict";

export interface SubmittedOperation {
  hash: Hex;
  userOperation: UserOperation<"0.8">;
  outcome: Exclude<FakeOperationOutcome, "rejected">;
  bundleHash: Hex;
}

export interface FakeUsdcGas {
  /** The payer's EIP-7702 delegation; an operation carrying an authorization installs ours, even when it reverts. */
  delegation: FakeDelegation;
  /** Applies to every operation sent from now on. */
  outcome: FakeOperationOutcome;
  feeSpreadBips: bigint;
  /** What the bundler estimates for pre-verification gas; raise it to push an operation past its reviewed cap. */
  preVerificationGas: bigint;
  /** The payer's USDC allowance to the paymaster; an included operation resets it to 0. */
  paymasterAllowance: bigint;
  /** Operations the bundler accepted, in order. */
  operations: SubmittedOperation[];
  /**
   * Answers this fake's contract reads. The app batches concurrent reads into one multicall, so pass this to
   * `installFakeSquid` and a batch mixing both fakes' reads is answered in one place.
   */
  read: (target: string, data: Hex) => Hex | undefined;
}

/**
 * USDC gas on Base for one payer: Circle's paymaster reads, the Uniswap quoter, the payer's delegation, USDC
 * permit nonces and paymaster allowance, the EntryPoint nonce, and a Pimlico bundler behind `/api/bundler` that
 * checks what a real one would (sender, EntryPoint, 7702 authorization, operation signature). Other RPC calls fall
 * through to the fakes installed before it. Mutate the returned object to script delegation and outcomes.
 */
export async function installFakeUsdcGas(
  page: Page,
  payer: Hex,
  initial: Partial<Omit<FakeUsdcGas, "operations" | "read">> = {},
): Promise<FakeUsdcGas> {
  const fake: FakeUsdcGas = {
    delegation: "none",
    outcome: "included",
    feeSpreadBips: 0n,
    paymasterAllowance: 0n,
    preVerificationGas: 60_000n,
    ...initial,
    operations: [],
    read: (target, data) => readBase(target, data),
  };
  // The bundler hands an operation back in the hex form it was sent in.
  const sentAsRpc = new Map<Hex, RpcUserOperation<"0.8">>();
  const isPayer = (address: unknown) => typeof address === "string" && address.toLowerCase() === payer.toLowerCase();
  const delegationCode = (): Hex => {
    if (fake.delegation === "none") return "0x";
    return `0xef0100${(fake.delegation === "ours" ? SIMPLE_7702_ACCOUNT : OTHER_DELEGATE).slice(2)}`;
  };
  // A submitted operation spends its nonce and its permit whether or not the batch succeeds.
  const spentNonces = () => BigInt(fake.operations.filter((op) => op.outcome !== "unresolved").length);

  const readBase = (target: string, data: Hex): Hex | undefined => {
    const to = target.toLowerCase();
    if (to === PAYMASTER) {
      const { functionName } = decodeFunctionData({ abi: paymasterAbi, data });
      if (functionName === "fetchPrice")
        return encodeFunctionResult({ abi: paymasterAbi, functionName, result: FAKE_ETH_PRICE });
      const result = functionName === "feeSpread" ? fake.feeSpreadBips : ADDITIONAL_GAS_CHARGE;
      return encodeFunctionResult({ abi: paymasterAbi, functionName, result: Number(result) });
    }
    if (to === QUOTER) {
      const { args } = decodeFunctionData({ abi: quoterAbi, data });
      const [{ amount }] = args;
      const amountIn = (amount * FAKE_ETH_PRICE + 10n ** 18n - 1n) / 10n ** 18n;
      return encodeFunctionResult({
        abi: quoterAbi,
        functionName: "quoteExactOutputSingle",
        result: [amountIn, 0n, 0, 100_000n],
      });
    }
    if (to === ENTRY_POINT && data.startsWith(toFunctionSelector("getNonce(address,uint192)"))) {
      return encodeFunctionResult({ abi: entryPoint08Abi, functionName: "getNonce", result: spentNonces() });
    }
    if (to === BASE_USDC && data.startsWith(toFunctionSelector("nonces(address)"))) {
      return encodeFunctionResult({ abi: permitAbi, functionName: "nonces", result: spentNonces() });
    }
    // Base USDC's EIP-712 domain, which the paymaster permit is signed over.
    if (to === BASE_USDC && data.startsWith(toFunctionSelector("name()"))) {
      return encodeFunctionResult({ abi: permitAbi, functionName: "name", result: "USD Coin" });
    }
    if (to === BASE_USDC && data.startsWith(toFunctionSelector("version()"))) {
      return encodeFunctionResult({ abi: permitAbi, functionName: "version", result: "2" });
    }
    if (to === BASE_USDC && data.startsWith(toFunctionSelector("balanceOf(address)"))) {
      const { args } = decodeFunctionData({ abi: erc20Abi, data });
      if (!isPayer(args[0])) return undefined;
      return encodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", result: PAYER_USDC });
    }
    if (to === BASE_USDC && data.startsWith(toFunctionSelector("allowance(address,address)"))) {
      const { args, functionName } = decodeFunctionData({ abi: erc20Abi, data });
      // The Squid router's allowance belongs to the fakes installed before this one.
      if (functionName !== "allowance" || !isPayer(args[0]) || args[1].toLowerCase() !== PAYMASTER) return undefined;
      return encodeFunctionResult({ abi: erc20Abi, functionName, result: fake.paymasterAllowance });
    }
    return undefined;
  };

  const bundleReceipt = (op: SubmittedOperation) => ({
    transactionHash: op.bundleHash,
    transactionIndex: "0x0",
    blockHash: op.bundleHash,
    blockNumber: "0x1",
    from: BUNDLER,
    to: ENTRY_POINT,
    cumulativeGasUsed: "0x0",
    gasUsed: "0x0",
    effectiveGasPrice: numberToHex(GAS_PRICE),
    contractAddress: null,
    logs: [],
    logsBloom: `0x${"0".repeat(512)}`,
    // The bundle succeeds even when the operation inside it reverts.
    status: "0x1",
    type: "0x4",
  });

  const answerBase = (call: RpcCall): unknown => {
    switch (call.method) {
      case "eth_getCode":
        return isPayer(call.params[0]) ? delegationCode() : undefined;
      // The authorization nonce; the payer sends no transactions of its own on this path.
      case "eth_getTransactionCount":
        return isPayer(call.params[0]) ? numberToHex(fake.delegation === "ours" ? 1 : 0) : undefined;
      case "eth_getTransactionReceipt": {
        const op = fake.operations.find((candidate) => candidate.bundleHash === call.params[0]);
        return op && op.outcome !== "unresolved" ? bundleReceipt(op) : undefined;
      }
      case "eth_call": {
        const { to, data } = call.params[0] as { to: string; data: Hex };
        if (to.toLowerCase() !== MULTICALL3 || !data.startsWith(AGGREGATE3)) return readBase(to, data);
        const { args } = decodeFunctionData({ abi: multicall3Abi, data });
        const results = (args[0] as readonly { target: Hex; callData: Hex }[]).map((c) =>
          readBase(c.target, c.callData),
        );
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

  const toUserOperation = (rpc: RpcUserOperation<"0.8"> & { eip7702Auth?: RpcAuthorization }) => {
    const { eip7702Auth, ...fields } = rpc;
    const userOperation = formatUserOperation(fields) as UserOperation<"0.8">;
    if (!eip7702Auth) return userOperation;
    return {
      ...userOperation,
      authorization: {
        address: eip7702Auth.address,
        chainId: Number(eip7702Auth.chainId),
        nonce: Number(eip7702Auth.nonce),
        r: eip7702Auth.r,
        s: eip7702Auth.s,
        yParity: Number(eip7702Auth.yParity),
      },
    };
  };

  /** The validation error a real bundler would return for this operation, if any. */
  const validationError = async (userOperation: UserOperation<"0.8">, entryPoint: unknown, signed: boolean) => {
    if (typeof entryPoint !== "string" || entryPoint.toLowerCase() !== ENTRY_POINT) return "unsupported EntryPoint";
    if (!isPayer(userOperation.sender)) return "fake bundler only knows the payer";
    const { authorization } = userOperation;
    if (authorization) {
      // The console must never replace a delegation it did not install.
      if (fake.delegation === "conflict") return "fake bundler: authorization would overwrite another delegation";
      if (authorization.address.toLowerCase() !== SIMPLE_7702_ACCOUNT || authorization.chainId !== BASE_CHAIN_ID) {
        return "AA24 invalid 7702 authorization";
      }
      // Estimation runs with a stub authorization, as viem sends one for an account not yet delegated.
      if (signed && !isPayer(await recoverAuthorizationAddress({ authorization }))) {
        return "AA24 invalid 7702 authorization";
      }
    } else if (fake.delegation === "none") {
      return "AA20 account not deployed";
    } else if (fake.delegation === "conflict") {
      return "AA23 reverted: sender delegates to another account";
    }
    if (!signed) return undefined;
    const hash = getUserOperationHash({
      chainId: BASE_CHAIN_ID,
      entryPointAddress: ENTRY_POINT,
      entryPointVersion: "0.8",
      userOperation,
    });
    const signer = await recoverAddress({ hash, signature: userOperation.signature });
    return isPayer(signer) ? undefined : "AA24 signature error";
  };

  // Circle's paymaster reports what it kept after refunding the rest of the prefund.
  const sponsoredLog = (op: SubmittedOperation) => ({
    address: PAYMASTER,
    topics: [
      toEventSelector("UserOperationSponsored(address,address,bytes32,uint256,uint256,uint256)"),
      pad(BASE_USDC),
      pad(op.userOperation.sender),
    ],
    data: encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [op.hash, FAKE_ETH_PRICE, FAKE_CHARGED_USDC, 0n],
    ),
    blockNumber: "0x1",
    blockHash: op.bundleHash,
    transactionHash: op.bundleHash,
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  });

  const receiptOf = (op: SubmittedOperation) => ({
    userOpHash: op.hash,
    entryPoint: ENTRY_POINT,
    sender: op.userOperation.sender,
    nonce: numberToHex(op.userOperation.nonce),
    paymaster: op.userOperation.paymaster ?? null,
    actualGasCost: numberToHex(400_000n * GAS_PRICE),
    actualGasUsed: numberToHex(400_000n),
    success: op.outcome === "included",
    reason: op.outcome === "reverted" ? "0x" : undefined,
    logs: [sponsoredLog(op)],
    receipt: bundleReceipt(op),
  });

  const answerBundler = async (
    call: RpcCall,
  ): Promise<{ result: unknown } | { error: { code: number; message: string } }> => {
    switch (call.method) {
      case "pimlico_getUserOperationGasPrice": {
        const fee = { maxFeePerGas: numberToHex(GAS_PRICE * 2n), maxPriorityFeePerGas: numberToHex(GAS_PRICE) };
        return { result: { slow: fee, standard: fee, fast: fee } };
      }
      case "eth_estimateUserOperationGas": {
        const [rpc, entryPoint] = call.params as [RpcUserOperation<"0.8"> & { eip7702Auth?: RpcAuthorization }, Hex];
        const error = await validationError(toUserOperation(rpc), entryPoint, false);
        if (error) return { error: { code: -32500, message: error } };
        return {
          result: {
            preVerificationGas: numberToHex(fake.preVerificationGas),
            verificationGasLimit: numberToHex(rpc.eip7702Auth ? 150_000n : 100_000n),
            callGasLimit: numberToHex(600_000n),
            paymasterVerificationGasLimit: numberToHex(200_000n),
            paymasterPostOpGasLimit: numberToHex(ADDITIONAL_GAS_CHARGE),
          },
        };
      }
      case "eth_sendUserOperation": {
        const [rpc, entryPoint] = call.params as [RpcUserOperation<"0.8"> & { eip7702Auth?: RpcAuthorization }, Hex];
        const userOperation = toUserOperation(rpc);
        const error = await validationError(userOperation, entryPoint, true);
        if (error) return { error: { code: -32500, message: error } };
        const { outcome } = fake;
        if (outcome === "rejected")
          return { error: { code: -32500, message: "AA33 reverted: paymaster validation failed" } };
        const hash = getUserOperationHash({
          chainId: BASE_CHAIN_ID,
          entryPointAddress: ENTRY_POINT,
          entryPointVersion: "0.8",
          userOperation,
        });
        const bundleHash = concat(["0xbb", hash.slice(4) as Hex]);
        fake.operations.push({ hash, userOperation, outcome, bundleHash });
        sentAsRpc.set(hash, rpc);
        if (outcome !== "unresolved" && userOperation.authorization) fake.delegation = "ours";
        if (outcome === "included") fake.paymasterAllowance = 0n;
        return { result: hash };
      }
      case "eth_getUserOperationReceipt": {
        const op = fake.operations.find((candidate) => candidate.hash === call.params[0]);
        return { result: op && op.outcome !== "unresolved" ? receiptOf(op) : null };
      }
      case "eth_getUserOperationByHash": {
        const op = fake.operations.find((candidate) => candidate.hash === call.params[0]);
        if (!op || op.outcome === "unresolved") return { result: null };
        return {
          result: {
            userOperation: sentAsRpc.get(op.hash),
            entryPoint: ENTRY_POINT,
            transactionHash: op.bundleHash,
            blockHash: op.bundleHash,
            blockNumber: "0x1",
          },
        };
      }
      default:
        return { error: { code: -32601, message: `fake bundler does not support ${call.method}` } };
    }
  };

  await page.route(
    (url) => url.hostname === BASE_RPC_HOST,
    async (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? "null") as RpcCall | RpcCall[] | null;
      if (!body) return route.fallback();
      const calls = Array.isArray(body) ? body : [body];
      const results = calls.map(answerBase);
      if (results.some((r) => r === undefined)) return route.fallback();
      const replies = calls.map((c, i) => ({ jsonrpc: "2.0", id: c.id, result: results[i] }));
      return route.fulfill({ json: Array.isArray(body) ? replies : replies[0] });
    },
  );
  await page.route("**/api/bundler", async (route) => {
    const call = route.request().postDataJSON() as RpcCall;
    // Like a JSON-RPC server, errors ride in the body of a 200.
    return route.fulfill({ json: { jsonrpc: "2.0", id: call.id, ...(await answerBundler(call)) } });
  });
  return fake;
}
