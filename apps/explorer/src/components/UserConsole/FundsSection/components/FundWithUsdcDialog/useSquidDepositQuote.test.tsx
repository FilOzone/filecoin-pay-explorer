import type { ConnectedWallet } from "@privy-io/react-auth";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSquidDepositQuote } from "./useSquidDepositQuote";

const RECIPIENT = "0x2222222222222222222222222222222222222222";
const BASE_USDC = { chainId: 8453, token: "0x4444444444444444444444444444444444444444", symbol: "USDC", decimals: 6 };
const wallet = { address: "0x1111111111111111111111111111111111111111", walletClientType: "privy" } as ConnectedWallet;

const queries = vi.hoisted(() => ({
  balance: 0n,
  enabledByKey: {} as Record<string, boolean>,
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: ({ enabled, queryKey }: { enabled: boolean; queryKey: unknown[] }) => {
    queries.enabledByKey[String(queryKey[0])] = enabled;
    return {
      data:
        queryKey[0] === "squid-usdc-tokens"
          ? [BASE_USDC]
          : queryKey[0] === "squid-deposit-balances"
            ? { token: queries.balance, native: 0n, gasPrice: 1n }
            : undefined,
    };
  },
}));

let latest!: ReturnType<typeof useSquidDepositQuote>;
function Harness({ amount }: { amount: string }) {
  latest = useSquidDepositQuote({
    amount,
    depositTarget: { payments: RECIPIENT, usdfc: RECIPIENT },
    isQuoting: true,
    open: true,
    payingWallet: wallet,
    recipient: RECIPIENT,
    sourceChainId: 8453,
    sourceClient: {} as never,
    sourceTokenAddress: BASE_USDC.token,
    squid: { integratorId: "test" },
  });
  return null;
}

beforeEach(() => {
  queries.balance = 0n;
  queries.enabledByKey = {};
});

describe("useSquidDepositQuote", () => {
  it("asks Squid for a quote only when the wallet holds enough of the source token", async () => {
    queries.balance = 5_000_000n;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Harness amount='4' />);
    });
    expect(latest.hasInsufficientUsdc).toBe(false);
    expect(queries.enabledByKey["squid-deposit-quote"]).toBe(true);

    await act(async () => {
      renderer.update(<Harness amount='6' />);
    });
    expect(latest.hasInsufficientUsdc).toBe(true);
    expect(queries.enabledByKey["squid-deposit-quote"]).toBe(false);
  });

  it("never quotes for an empty wallet", async () => {
    await act(async () => {
      create(<Harness amount='1' />);
    });
    expect(latest.balances?.token).toBe(0n);
    expect(latest.hasInsufficientUsdc).toBe(true);
    expect(queries.enabledByKey["squid-deposit-quote"]).toBe(false);
  });
});
