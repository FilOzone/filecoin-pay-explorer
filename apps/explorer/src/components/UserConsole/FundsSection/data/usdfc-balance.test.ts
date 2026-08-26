import { describe, expect, it, vi } from "vitest";
import { readUsdfcBalance } from "./usdfc-balance";

describe("readUsdfcBalance", () => {
  it("reads the owner's exact ERC-20 balance", async () => {
    const token = "0x1111111111111111111111111111111111111111" as const;
    const owner = "0x2222222222222222222222222222222222222222" as const;
    const readContract = vi.fn().mockResolvedValue(123n);

    await expect(readUsdfcBalance({ readContract } as never, token, owner)).resolves.toBe(123n);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: token, args: [owner], functionName: "balanceOf" }),
    );
  });
});
