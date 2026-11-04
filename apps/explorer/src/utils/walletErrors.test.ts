import { describe, expect, it } from "vitest";
import { isUserRejectedRequest, walletErrorMessage } from "./walletErrors";

describe("wallet errors", () => {
  it("recognizes nested wallet rejection errors", () => {
    expect(isUserRejectedRequest({ cause: { code: 4001 } })).toBe(true);
    expect(isUserRejectedRequest(new Error("response lost"))).toBe(false);
  });

  it("shortens wallet rejection errors without hiding other failures", () => {
    expect(walletErrorMessage({ cause: { code: 4001 } }, "fallback")).toBe("Transaction cancelled in your wallet.");
    expect(walletErrorMessage(new Error("response lost"), "fallback")).toBe("response lost");
    expect(walletErrorMessage(null, "fallback")).toBe("fallback");
  });

  it("shows a viem error's short message and detail instead of the whole request", () => {
    const rpcError = Object.assign(
      new Error(
        "An unknown RPC error occurred.\n\nRequest Arguments:\n  from: 0xa625\n  data: 0x095ea7b3…\n\nDetails: Wallet timeout\nVersion: viem@2.56.0",
      ),
      { shortMessage: "An unknown RPC error occurred.", details: "Wallet timeout" },
    );
    expect(walletErrorMessage(rpcError, "fallback")).toBe("An unknown RPC error occurred. Wallet timeout");

    const repeated = Object.assign(new Error("long"), { shortMessage: "Wallet timeout.", details: "Wallet timeout" });
    expect(walletErrorMessage(repeated, "fallback")).toBe("Wallet timeout.");

    const endless = new Error("x".repeat(300));
    expect(walletErrorMessage(endless, "fallback")).toBe(`${"x".repeat(239)}…`);
  });
});
