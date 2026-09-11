import { describe, expect, it } from "vitest";
import { isSearchable, toServiceRailsFilter } from "./rails-filter";

const ADDRESS = "0x01d2a6dfa9ccbf4eefe50dfa5fd05341a0f74050";

describe("toServiceRailsFilter", () => {
  it("filters on payee for an address", () => {
    expect(toServiceRailsFilter(ADDRESS)).toEqual({ payee: ADDRESS });
  });

  it("accepts an address whose casing fails a checksum, as pasted from the table", () => {
    const mixed = "0x01D2a6dfa9ccbf4eefe50dfa5fd05341a0f74050";

    expect(toServiceRailsFilter(mixed)).toEqual({ payee: mixed });
  });

  it("filters on rail ID for a number", () => {
    expect(toServiceRailsFilter("27138")).toEqual({ railId: "27138" });
  });

  it("ignores surrounding whitespace", () => {
    expect(toServiceRailsFilter(`  ${ADDRESS} `)).toEqual({ payee: ADDRESS });
    expect(toServiceRailsFilter(" 42 ")).toEqual({ railId: "42" });
  });

  it("returns no filter for an empty query", () => {
    expect(toServiceRailsFilter("   ")).toEqual({});
  });
});

describe("isSearchable", () => {
  it.each([ADDRESS, "42", " 42 "])("accepts %s", (query) => {
    expect(isSearchable(query)).toBe(true);
  });

  // Exact matching means a partial value would silently return nothing, so the
  // search stays disabled rather than reporting an empty result.
  it.each(["", "  ", "0x8f1d", "not-an-address", "12abc", "-1"])("rejects %s", (query) => {
    expect(isSearchable(query)).toBe(false);
  });
});
