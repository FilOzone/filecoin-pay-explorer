import { describe, expect, it } from "vitest";
import { parseServiceRailsSearch } from "./rails-filter";

const ADDRESS = "0x01d2a6dfa9ccbf4eefe50dfa5fd05341a0f74050";

describe("parseServiceRailsSearch", () => {
  it("narrows on payee for an address, and says so", () => {
    expect(parseServiceRailsSearch(ADDRESS)).toEqual({
      filter: { payee: ADDRESS },
      summary: { label: "Payee", value: "0x01d2...4050" },
    });
  });

  it("narrows on rail ID for a number, and says so", () => {
    expect(parseServiceRailsSearch("27138")).toEqual({
      filter: { railId: "27138" },
      summary: { label: "Rail ID", value: "27138" },
    });
  });

  it("accepts a mixed-case address whose checksum does not validate", () => {
    const mixed = "0x01D2a6dfa9ccbf4eefe50dfa5fd05341a0f74050";

    expect(parseServiceRailsSearch(mixed).filter).toEqual({ payee: mixed });
  });

  // A summary is present exactly when the filter narrows something, so callers
  // have one thing to test for "is this searchable" and "am I filtering".
  it.each([
    "",
    "   ",
    "abc",
    "0x8f1d",
    "12abc",
    "-1",
    "not-an-address",
  ])("narrows on nothing and offers no summary for %s", (query) => {
    expect(parseServiceRailsSearch(query)).toEqual({ filter: {} });
  });
});
