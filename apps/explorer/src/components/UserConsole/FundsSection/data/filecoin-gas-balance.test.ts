import { describe, expect, it } from "vitest";
import { filecoinGasBalanceStatus } from "./filecoin-gas-balance";

describe("filecoinGasBalanceStatus", () => {
  it("distinguishes sufficient, insufficient, loading, and unreadable balances", () => {
    expect(filecoinGasBalanceStatus(1n, false, false)).toBe("funded");
    expect(filecoinGasBalanceStatus(0n, false, false)).toBe("insufficient");
    expect(filecoinGasBalanceStatus(24n, false, false, 25n)).toBe("insufficient");
    expect(filecoinGasBalanceStatus(25n, false, false, 25n)).toBe("funded");
    expect(filecoinGasBalanceStatus(25n, true, false, 25n)).toBe("loading");
    expect(filecoinGasBalanceStatus(undefined, true, false)).toBe("loading");
    expect(filecoinGasBalanceStatus(undefined, false, true)).toBe("unavailable");
    expect(filecoinGasBalanceStatus(undefined, false, false)).toBe("unavailable");
  });
});
