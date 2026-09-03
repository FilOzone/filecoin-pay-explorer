import { describe, expect, it } from "vitest";
import { isUsdcFundingAvailable } from "./usdc-funding-availability";

describe("isUsdcFundingAvailable", () => {
  it("offers USDC funding on Filecoin mainnet and Squid source networks only", () => {
    const chains = { unknown: undefined, mainnet: 314, calibration: 314159, base: 8453, ethereum: 1, unsupported: 5 };
    expect(Object.fromEntries(Object.entries(chains).map(([name, id]) => [name, isUsdcFundingAvailable(id)]))).toEqual({
      unknown: true,
      mainnet: true,
      calibration: false,
      base: true,
      ethereum: true,
      unsupported: false,
    });
  });
});
