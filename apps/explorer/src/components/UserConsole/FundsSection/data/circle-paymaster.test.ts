import { describe, expect, it, vi } from "vitest";
import {
  CIRCLE_PAYMASTER_ADDRESS,
  circlePaymasterAbi,
  getPaymasterGasLimits,
  getPaymasterGasMaximum,
  getPaymasterPrefund,
  type PaymasterFees,
  readPaymasterFees,
  type UserOperationGas,
} from "./circle-paymaster";

const gas: UserOperationGas = {
  callGasLimit: 500_000n,
  verificationGasLimit: 100_000n,
  preVerificationGas: 60_000n,
  paymasterVerificationGasLimit: 200_000n,
  paymasterPostOpGasLimit: 35_000n,
  maxFeePerGas: 10_000_000n,
};
// Live Base values on Oct 15, 2026: 35,000 gas, no spread, 2,418.283795 USDC per ETH.
const fees: PaymasterFees = { additionalGasCharge: 35_000n, feeSpreadBips: 0n, nativeTokenPrice: 2_418_283_795n };

describe("getPaymasterPrefund", () => {
  it("prices the EntryPoint maximum plus the paymaster's own gas in USDC, rounding up by one unit", () => {
    // (35,000 + 895,000 gas) × 0.01 gwei = 9.3e12 wei; × 2,418.283795 USDC/ETH = 22,490.03 units, floored, + 1.
    expect(getPaymasterPrefund(gas, fees)).toBe(22_491n);
  });

  it("adds the fee spread on top of the base charge", () => {
    expect(getPaymasterPrefund(gas, { ...fees, feeSpreadBips: 500n })).toBe(22_491n + 1_124n);
  });
});

describe("getPaymasterGasMaximum", () => {
  it("allows the oracle price to rise 10% before validation", () => {
    expect(getPaymasterGasMaximum(gas, fees)).toBe(24_740n);
  });
});

describe("getPaymasterGasLimits", () => {
  it("sets the post-op limit to the paymaster's additional gas charge", () => {
    expect(getPaymasterGasLimits({ additionalGasCharge: 41_000n })).toEqual({
      paymasterVerificationGasLimit: 200_000n,
      paymasterPostOpGasLimit: 41_000n,
    });
  });
});

describe("readPaymasterFees", () => {
  const clientReturning = (feeSpread: number) => ({
    multicall: vi.fn().mockResolvedValue([35_000, feeSpread, 2_418_283_795n]),
  });

  it("reads the charge, spread and price from Circle's paymaster", async () => {
    const client = clientReturning(0);

    await expect(readPaymasterFees(client)).resolves.toEqual(fees);
    expect(client.multicall).toHaveBeenCalledWith({
      allowFailure: false,
      contracts: [
        { abi: circlePaymasterAbi, address: CIRCLE_PAYMASTER_ADDRESS, functionName: "additionalGasCharge" },
        { abi: circlePaymasterAbi, address: CIRCLE_PAYMASTER_ADDRESS, functionName: "feeSpread" },
        { abi: circlePaymasterAbi, address: CIRCLE_PAYMASTER_ADDRESS, functionName: "fetchPrice" },
      ],
    });
  });

  it("accepts the documented 10% spread", async () => {
    await expect(readPaymasterFees(clientReturning(1_000))).resolves.toEqual({ ...fees, feeSpreadBips: 1_000n });
  });

  it("fails closed above a 10% spread", async () => {
    await expect(readPaymasterFees(clientReturning(1_001))).rejects.toThrow("surcharge is above 10%");
  });
});
