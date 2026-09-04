import { describe, expect, it } from "vitest";
import { filecoinGasBalanceStatus } from "./filecoin-gas-balance";

describe("filecoinGasBalanceStatus", () => {
  it("distinguishes fresh positive, empty, loading, and unreadable balances", () => {
    expect(filecoinGasBalanceStatus(1n, false, false)).toBe("funded");
    expect(filecoinGasBalanceStatus(0n, false, false)).toBe("empty");
    expect(filecoinGasBalanceStatus(undefined, true, false)).toBe("loading");
    expect(filecoinGasBalanceStatus(undefined, false, true)).toBe("unavailable");
    expect(filecoinGasBalanceStatus(undefined, false, false)).toBe("unavailable");
  });
});
