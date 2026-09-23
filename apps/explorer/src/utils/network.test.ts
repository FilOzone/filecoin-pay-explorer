import { describe, expect, it } from "vitest";
import { calibration, mainnet } from "@/constants/chains";
import { isSupportedChainId } from "./network";

describe("isSupportedChainId", () => {
  it("accepts both Filecoin networks and rejects other chains", () => {
    expect(isSupportedChainId(mainnet.id)).toBe(true);
    expect(isSupportedChainId(calibration.id)).toBe(true);
    expect(isSupportedChainId(1)).toBe(false);
  });
});
