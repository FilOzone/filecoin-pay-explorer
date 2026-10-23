import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { checkUsdcGasPayer } from "./usdc-gas-payer";

const PAYER = "0x1111111111111111111111111111111111111111" as const;
const OUR_DELEGATION: Hex = "0xef0100e6cae83bde06e4c305530e199d7217f42808555b";
const OTHER_DELEGATION: Hex = "0xef01001111111111111111111111111111111111111111";

const client = ({ code, feeSpread = 0 }: { code?: Hex; feeSpread?: number } = {}) =>
  ({
    getCode: vi.fn(async () => code),
    multicall: vi.fn(async () => [35_000, feeSpread, 2_500_000_000n]),
  }) as unknown as Parameters<typeof checkUsdcGasPayer>[0];

describe("checkUsdcGasPayer", () => {
  it.each([
    ["an undelegated account", undefined],
    ["an account already delegated to ours", OUR_DELEGATION],
  ])("accepts %s", async (_label, code) => {
    await expect(checkUsdcGasPayer(client({ code }), PAYER)).resolves.toBe("ready");
  });

  it("refuses an account delegated to another contract", async () => {
    await expect(checkUsdcGasPayer(client({ code: OTHER_DELEGATION }), PAYER)).resolves.toBe("conflict");
  });

  it("fails while Circle's surcharge is above its cap", async () => {
    await expect(checkUsdcGasPayer(client({ feeSpread: 1_001 }), PAYER)).rejects.toThrow(
      "surcharge is above 10%. Try again later.",
    );
  });
});
