import { describe, expect, it } from "vitest";
import { resolveAddressName } from "./known-addresses";

const STORACHA = "0x3c1ae7a70a2b51458fcb7927fd77aae408a1b857";
const UNKNOWN = "0x9999999999999999999999999999999999999999";

describe("resolveAddressName", () => {
  it("keeps the curated name ahead of the onchain name", () => {
    expect(resolveAddressName(STORACHA, "Impostor")).toEqual({ name: "Storacha", source: "known" });
  });

  it("uses the onchain name for an unknown address", () => {
    expect(resolveAddressName(UNKNOWN, "Somebody's Storage")).toEqual({
      name: "Somebody's Storage",
      source: "onchain",
    });
  });

  it("returns undefined when neither exists", () => {
    expect(resolveAddressName(UNKNOWN)).toBeUndefined();
    expect(resolveAddressName(UNKNOWN, "")).toBeUndefined();
  });

  it("matches known addresses case-insensitively", () => {
    expect(resolveAddressName(STORACHA.toUpperCase().replace("0X", "0x"))).toEqual({
      name: "Storacha",
      source: "known",
    });
  });

  it("rejects an onchain name that copies a curated label on another address", () => {
    expect(resolveAddressName(UNKNOWN, "Storacha")).toEqual({ source: "rejected" });
    expect(resolveAddressName(UNKNOWN, "  sToRaChA ")).toEqual({ source: "rejected" });
  });
});
