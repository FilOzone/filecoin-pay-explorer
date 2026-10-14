import type { Page } from "@playwright/test";
import { createPublicClient, custom, encodeFunctionData, erc20Abi, parseAbi } from "viem";
import { createBundlerClient, getUserOperationHash, toSimple7702SmartAccount } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { type FakeUsdcGas, installFakeUsdcGas } from "./fake-usdc-gas";
import { expect, test } from "./fixtures";

// Drives the fake with viem's own account-abstraction client, as the console will, so the fake stays
// compatible with what viem sends. Requests go out from the page, where the fakes' routes answer them.

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYMASTER = "0x0578cFB241215b77442a541325d6A4E6dFE700Ec";
const ENTRY_POINT = "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108";

function viaPage(page: Page, url: string) {
  return custom({
    request: async ({ method, params }) => {
      const reply = await page.evaluate(
        async ({ body, url }) => {
          const response = await fetch(url, { body, headers: { "content-type": "application/json" }, method: "POST" });
          return (await response.json()) as { result?: unknown; error?: { code: number; message: string } };
        },
        { body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), url },
      );
      if (reply.error) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
      return reply.result;
    },
  });
}

async function setUp(page: Page, initial: Partial<Omit<FakeUsdcGas, "operations" | "read">> = {}) {
  const owner = privateKeyToAccount(generatePrivateKey());
  const fake = await installFakeUsdcGas(page, owner.address, initial);
  await page.goto("/console");
  const client = createPublicClient({ chain: base, transport: viaPage(page, "https://base-rpc.publicnode.com") });
  const bundler = createBundlerClient({ chain: base, client, transport: viaPage(page, "/api/bundler") });
  const account = await toSimple7702SmartAccount({ client, owner });
  const operation = {
    account,
    calls: [{ to: USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [PAYMASTER, 0n] }) }],
    maxFeePerGas: 2_000_000n,
    maxPriorityFeePerGas: 1_000_000n,
    paymaster: PAYMASTER,
    paymasterData: "0x00",
    paymasterPostOpGasLimit: 35_000n,
    paymasterVerificationGasLimit: 200_000n,
  } as const;
  const authorize = (nonce = 0) =>
    owner.signAuthorization({ contractAddress: account.authorization.address, chainId: base.id, nonce });
  return { account, authorize, bundler, client, fake, operation, owner };
}

test("a first operation installs the delegation and later ones reuse it", async ({ page }) => {
  const { account, authorize, bundler, client, fake, operation } = await setUp(page);
  expect(await client.getCode({ address: account.address })).toBeUndefined();

  const first = await bundler.sendUserOperation({ ...operation, authorization: await authorize() });
  const firstReceipt = await bundler.waitForUserOperationReceipt({ hash: first, pollingInterval: 50 });

  expect(firstReceipt.success).toBe(true);
  expect(await client.getCode({ address: account.address })).toBe("0xef0100e6cae83bde06e4c305530e199d7217f42808555b");
  const bundle = await client.getTransactionReceipt({ hash: firstReceipt.receipt.transactionHash });
  expect(bundle.status).toBe("success");

  const second = await bundler.sendUserOperation(operation);
  expect((await bundler.waitForUserOperationReceipt({ hash: second, pollingInterval: 50 })).success).toBe(true);
  expect(
    fake.operations.map((op) => [op.hash, Boolean(op.userOperation.authorization), op.userOperation.nonce]),
  ).toEqual([
    [first, true, 0n],
    [second, false, 1n],
  ]);
  expect(await account.getNonce()).toBe(2n);
});

test("answers the paymaster, quoter and USDC reads a deposit is sized from", async ({ page }) => {
  const { account, client } = await setUp(page, { feeSpreadBips: 500n, paymasterAllowance: 1_000n });
  const paymaster = {
    address: PAYMASTER,
    abi: parseAbi([
      "function additionalGasCharge() view returns (uint32)",
      "function feeSpread() view returns (uint32)",
      "function fetchPrice() view returns (uint256)",
    ]),
  } as const;
  const noncesAbi = parseAbi(["function nonces(address owner) view returns (uint256)"]);

  expect(
    await Promise.all([
      client.readContract({ ...paymaster, functionName: "additionalGasCharge" }),
      client.readContract({ ...paymaster, functionName: "feeSpread" }),
      client.readContract({ ...paymaster, functionName: "fetchPrice" }),
      client.readContract({ address: USDC, abi: noncesAbi, functionName: "nonces", args: [account.address] }),
      client.readContract({
        address: USDC,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account.address, PAYMASTER],
      }),
    ]),
  ).toEqual([35_000, 500, 2_500_000_000n, 0n, 1_000n]);

  const { result } = await client.simulateContract({
    address: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    abi: parseAbi([
      "struct Params { address tokenIn; address tokenOut; uint256 amount; uint24 fee; uint160 sqrtPriceLimitX96; }",
      "function quoteExactOutputSingle(Params params) returns (uint256, uint160, uint32, uint256)",
    ]),
    functionName: "quoteExactOutputSingle",
    args: [
      {
        tokenIn: USDC,
        tokenOut: "0x4200000000000000000000000000000000000006",
        amount: 10n ** 15n,
        fee: 500,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  // 0.001 ETH at 2,500 USDC.
  expect(result[0]).toBe(2_500_000n);
});

test("a reverted operation is reported unsuccessful and still leaves the delegation installed", async ({ page }) => {
  const { account, authorize, bundler, client, operation } = await setUp(page, { outcome: "reverted" });

  const hash = await bundler.sendUserOperation({ ...operation, authorization: await authorize() });

  expect((await bundler.waitForUserOperationReceipt({ hash, pollingInterval: 50 })).success).toBe(false);
  expect(await client.getCode({ address: account.address })).toBe("0xef0100e6cae83bde06e4c305530e199d7217f42808555b");
});

test("refuses to replace another delegate, or to use it", async ({ page }) => {
  const { authorize, bundler, fake, operation } = await setUp(page, { delegation: "conflict" });

  await expect(bundler.sendUserOperation({ ...operation, authorization: await authorize() })).rejects.toThrow(
    "overwrite another delegation",
  );
  await expect(bundler.sendUserOperation(operation)).rejects.toThrow("AA23");
  expect(fake.operations).toEqual([]);
});

test("refuses an operation the payer did not sign", async ({ page }) => {
  const { authorize, bundler, operation } = await setUp(page);
  const authorization = await authorize();
  const prepared = await bundler.prepareUserOperation({ ...operation, authorization });
  const hash = getUserOperationHash({
    chainId: base.id,
    entryPointAddress: ENTRY_POINT,
    entryPointVersion: "0.8",
    userOperation: { ...prepared, authorization },
  });
  const forged = await privateKeyToAccount(generatePrivateKey()).sign({ hash });

  await expect(
    bundler.sendUserOperation({ ...prepared, account: operation.account, authorization, signature: forged }),
  ).rejects.toThrow("AA24 signature error");
});

test("a rejected operation never lands, and an unresolved one never reports", async ({ page }) => {
  const { account, authorize, bundler, fake, operation } = await setUp(page, { outcome: "rejected" });

  await expect(bundler.sendUserOperation({ ...operation, authorization: await authorize() })).rejects.toThrow("AA33");
  expect(fake.operations).toEqual([]);
  expect(fake.delegation).toBe("none");

  fake.outcome = "unresolved";
  const hash = await bundler.sendUserOperation({ ...operation, authorization: await authorize() });

  await expect(bundler.getUserOperationReceipt({ hash })).rejects.toThrow();
  expect(fake.delegation).toBe("none");
  expect(await account.getNonce()).toBe(0n);
});
