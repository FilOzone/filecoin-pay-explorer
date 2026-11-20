import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";

describe("devnet", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not exist in a production build, even with NEXT_PUBLIC_DEVNET_INFO set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEVNET_INFO", "{}");
    const chains = await import("./chains");
    assert.equal(chains.devnet, undefined);
    assert.throws(() => chains.getChain("devnet"), /devnet not found/);
  });
});
