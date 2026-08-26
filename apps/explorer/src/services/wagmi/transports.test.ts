import { describe, expect, it } from "vitest";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { createChainTransport, SOURCE_RPC_URLS } from "./transports";

const FILECOIN_MAINNET_ID = 314;

describe("source-chain transports", () => {
  it("covers every non-Filecoin Squid source chain with explicit endpoints", () => {
    for (const chain of SQUID_SOURCE_CHAINS) {
      if (chain.id === FILECOIN_MAINNET_ID) continue;
      expect(SOURCE_RPC_URLS[chain.id], `chain ${chain.id} (${chain.name})`).toBeDefined();
      expect(SOURCE_RPC_URLS[chain.id].length).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses only https endpoints", () => {
    for (const urls of Object.values(SOURCE_RPC_URLS)) {
      for (const url of urls) expect(url).toMatch(/^https:\/\//);
    }
  });

  it("returns a transport for covered and uncovered chains", () => {
    expect(createChainTransport(8453)).toBeTypeOf("function");
    expect(createChainTransport(314)).toBeTypeOf("function");
  });
});
