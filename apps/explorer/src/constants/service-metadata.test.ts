import { describe, expect, it } from "vitest";
import { getServiceProfile } from "./service-metadata";

const WARM_STORAGE = "0x02925630df557f957f70e112ba06e50965417ca0";
// In knownAddresses, but with no local description or prices.
const KNOWN_WITHOUT_COPY = "0x3c1ae7a70a2b51458fcb7927fd77aae408a1b857";
const UNKNOWN = "0x9999999999999999999999999999999999999999";

describe("getServiceProfile", () => {
  it("falls back to the truncated address for an operator we know nothing about", () => {
    expect(getServiceProfile(UNKNOWN)).toEqual({
      name: "0x9999...9999",
      description: undefined,
      homepageUrl: undefined,
      pricing: undefined,
    });
  });

  it("names an unknown operator from its contract", () => {
    const profile = getServiceProfile(UNKNOWN, { name: "Somebody's Storage" });

    expect(profile.name).toBe("Somebody's Storage");
  });

  it("keeps a curated name ahead of whatever the contract claims", () => {
    const profile = getServiceProfile(WARM_STORAGE, { name: "Totally Legitimate Storage" });

    expect(profile.name).toBe("Filecoin Warm Storage Service");
  });

  it("prefers contract description and homepage over the local copy", () => {
    const profile = getServiceProfile(WARM_STORAGE, {
      description: "Published onchain.",
      homepage: "https://example.com",
    });

    expect(profile.description).toBe("Published onchain.");
    expect(profile.homepageUrl).toBe("https://example.com");
  });

  it("keeps the local copy when the contract publishes none", () => {
    const profile = getServiceProfile(WARM_STORAGE);

    expect(profile.description).toContain("Warm storage service for the Filecoin Onchain Cloud");
    expect(profile.homepageUrl).toBe("https://github.com/filozone/filecoin-services");
  });

  it("keeps prices local: the contract interface does not carry them", () => {
    expect(getServiceProfile(WARM_STORAGE, { name: "x" }).pricing).toHaveLength(4);
    expect(getServiceProfile(KNOWN_WITHOUT_COPY, { description: "d" }).pricing).toBeUndefined();
  });
});
