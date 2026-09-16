import { describe, expect, it } from "vitest";
import { applyNetworkFeeExecutionBuffer, isUserRejectedRequest, walletErrorMessage } from "./squid-execution";

describe("Squid execution helpers", () => {
  it("applies the same rounded OP Stack buffer used by reviewed fee caps", () => {
    expect(applyNetworkFeeExecutionBuffer(8453, 3n)).toBe(4n);
    expect(applyNetworkFeeExecutionBuffer(1, 3n)).toBe(3n);
  });

  it("recognizes nested wallet rejection errors", () => {
    expect(isUserRejectedRequest({ cause: { code: 4001 } })).toBe(true);
    expect(isUserRejectedRequest(new Error("response lost"))).toBe(false);
  });

  it("shortens wallet rejection errors without hiding other failures", () => {
    expect(walletErrorMessage({ cause: { code: 4001 } }, "fallback")).toBe("Transaction cancelled in your wallet.");
    expect(walletErrorMessage(new Error("response lost"), "fallback")).toBe("response lost");
    expect(walletErrorMessage(null, "fallback")).toBe("fallback");
  });
});
