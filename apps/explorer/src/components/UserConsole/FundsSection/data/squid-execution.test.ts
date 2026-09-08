import { describe, expect, it, vi } from "vitest";
import {
  applyNetworkFeeExecutionBuffer,
  estimateOpStackTotalFee,
  isUserRejectedRequest,
  walletErrorMessage,
} from "./squid-execution";

const opStack = vi.hoisted(() => ({ estimateL1Fee: vi.fn(async () => 7_000n) }));
vi.mock("viem/op-stack", () => ({ estimateL1Fee: opStack.estimateL1Fee }));

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

describe("estimateOpStackTotalFee", () => {
  it("adds the oracle's L1 data fee to the gas at the fee per gas the transaction carries, without simulating", async () => {
    const client = { chain: undefined, readContract: vi.fn() };
    const request = {
      account: "0x1111111111111111111111111111111111111111" as const,
      to: "0x2222222222222222222222222222222222222222" as const,
      data: "0xabcdef" as const,
      value: 5n,
      gas: 60_000n,
      maxFeePerGas: 3n,
      gasPrice: 99n,
    };

    await expect(estimateOpStackTotalFee(client, request)).resolves.toBe(7_000n + 60_000n * 3n);
    expect(opStack.estimateL1Fee).toHaveBeenCalledWith(client, {
      account: request.account,
      to: request.to,
      data: request.data,
      value: request.value,
      chain: undefined,
    });

    const { maxFeePerGas: _unused, ...legacy } = request;
    await expect(estimateOpStackTotalFee(client, legacy)).resolves.toBe(7_000n + 60_000n * 99n);
    await expect(estimateOpStackTotalFee(client, { ...legacy, gasPrice: undefined })).rejects.toThrow(
      "Complete execution fee is unavailable",
    );
  });
});
