import { describe, expect, it } from "vitest";
import { FIL_TRANSACTION_FEE_RESERVE, getFilecoinGasBalanceStatus } from "./filecoin-gas-balance";
import { FIL_GAS_TOP_UP_AMOUNT } from "./squid-deposit-route";

describe("getFilecoinGasBalanceStatus", () => {
  it("distinguishes sufficient, insufficient, loading, and unreadable balances", () => {
    const settled = { isError: false, isLoading: false };
    expect(getFilecoinGasBalanceStatus({ ...settled, balance: FIL_TRANSACTION_FEE_RESERVE })).toBe("funded");
    expect(getFilecoinGasBalanceStatus({ ...settled, balance: FIL_TRANSACTION_FEE_RESERVE - 1n })).toBe("insufficient");
    expect(getFilecoinGasBalanceStatus({ ...settled, balance: 0n })).toBe("insufficient");
    expect(getFilecoinGasBalanceStatus({ ...settled, balance: 24n, minimumBalance: 25n })).toBe("insufficient");
    expect(getFilecoinGasBalanceStatus({ ...settled, balance: 25n, minimumBalance: 25n })).toBe("funded");
    expect(getFilecoinGasBalanceStatus({ balance: 25n, isError: false, isLoading: true })).toBe("loading");
    expect(getFilecoinGasBalanceStatus({ balance: undefined, isError: false, isLoading: true })).toBe("loading");
    expect(getFilecoinGasBalanceStatus({ balance: undefined, isError: true, isLoading: false })).toBe("unavailable");
    expect(getFilecoinGasBalanceStatus({ balance: undefined, isError: false, isLoading: false })).toBe("unavailable");
  });

  it("reserves 0.02 FIL, less than the 0.05 FIL a top-up delivers", () => {
    expect(FIL_TRANSACTION_FEE_RESERVE).toBe(20_000_000_000_000_000n);
    expect(FIL_TRANSACTION_FEE_RESERVE).toBeLessThan(FIL_GAS_TOP_UP_AMOUNT);
  });
});
