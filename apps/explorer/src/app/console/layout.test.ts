import { describe, expect, it } from "vitest";
import { getConsoleAccessState } from "./(console)/console-access";

describe("console access", () => {
  it("keeps the console page mounted on a Squid source chain", () => {
    expect(getConsoleAccessState({ isConnected: true, hasAddress: true, chainId: 8453 })).toBe("squid-source");
  });

  it("continues to reject unrelated unsupported chains", () => {
    expect(getConsoleAccessState({ isConnected: true, hasAddress: true, chainId: 12345 })).toBe("unsupported-chain");
  });
});
