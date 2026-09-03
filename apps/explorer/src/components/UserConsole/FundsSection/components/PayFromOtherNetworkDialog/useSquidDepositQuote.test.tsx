import { NATIVE_TOKEN_ADDRESS } from "@filecoin-project/squid-evm-funding";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSquidDepositQuote } from "./useSquidDepositQuote";

const RECIPIENT = "0x2222222222222222222222222222222222222222";
const BASE_USDC = { chainId: 8453, token: "0x4444444444444444444444444444444444444444", symbol: "USDC", decimals: 6 };
const BASE_ETH = { chainId: 8453, token: NATIVE_TOKEN_ADDRESS, symbol: "ETH", decimals: 18 };
const wallet = { address: "0x1111111111111111111111111111111111111111", walletClientType: "privy" } as ConnectedWallet;

const queries = vi.hoisted(() => ({
  balance: 0n,
  enabledByKey: {} as Record<string, boolean>,
  native: 0n,
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: ({ enabled, queryKey }: { enabled: boolean; queryKey: unknown[] }) => {
    queries.enabledByKey[String(queryKey[0])] = enabled;
    return {
      data:
        queryKey[0] === "squid-payment-tokens"
          ? [BASE_USDC, BASE_ETH]
          : queryKey[0] === "squid-deposit-balances"
            ? { token: queries.balance, native: queries.native, gasPrice: 1n }
            : undefined,
    };
  },
}));

let latest!: ReturnType<typeof useSquidDepositQuote>;
function Harness({ amount, token = BASE_USDC.token }: { amount: string; token?: string }) {
  latest = useSquidDepositQuote({
    amount,
    depositTarget: { payments: RECIPIENT, usdfc: RECIPIENT },
    isQuoting: true,
    open: true,
    payingWallet: wallet,
    recipient: RECIPIENT,
    sourceChainId: 8453,
    sourceClient: {} as never,
    sourceTokenAddress: token,
    squid: { integratorId: "test" },
  });
  return null;
}

beforeEach(() => {
  queries.balance = 0n;
  queries.enabledByKey = {};
  queries.native = 0n;
});

describe("useSquidDepositQuote", () => {
  it("asks Squid for a quote only when the wallet holds enough of the source token", async () => {
    queries.balance = 5_000_000n;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Harness amount='4' />);
    });
    expect(latest.hasInsufficientToken).toBe(false);
    expect(queries.enabledByKey["squid-deposit-quote"]).toBe(true);

    await act(async () => {
      renderer.update(<Harness amount='6' />);
    });
    expect(latest.hasInsufficientToken).toBe(true);
    expect(queries.enabledByKey["squid-deposit-quote"]).toBe(false);
  });

  it("falls back to plain USDC for an unknown token, and treats the native coin as its own balance", async () => {
    await act(async () => {
      create(<Harness amount='1' token='0x9999999999999999999999999999999999999999' />);
    });
    expect(latest.sourceToken).toEqual(BASE_USDC);
    expect(latest.isNativeSource).toBe(false);

    queries.balance = 2n * 10n ** 18n;
    await act(async () => {
      create(<Harness amount='1' token={NATIVE_TOKEN_ADDRESS} />);
    });
    expect(latest.sourceToken).toEqual(BASE_ETH);
    expect(latest.isNativeSource).toBe(true);
    expect(latest.hasInsufficientToken).toBe(false);
    // Nothing is known about gas until a quote exists, so Max offers the whole balance.
    expect(latest.spendable).toBe(2n * 10n ** 18n);
    expect(queries.enabledByKey["squid-deposit-quote"]).toBe(true);
  });

  it("never quotes for an empty wallet", async () => {
    await act(async () => {
      create(<Harness amount='1' />);
    });
    expect(latest.balances?.token).toBe(0n);
    expect(latest.hasInsufficientToken).toBe(true);
    expect(queries.enabledByKey["squid-deposit-quote"]).toBe(false);
  });
});
