import { describe, expect, it, vi } from "vitest";
import {
  buildIsAddServiceIndexed,
  decodeAddServiceContext,
  encodeAddServiceContext,
  invalidateAddServiceQueries,
} from "./lifecycle";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OPERATOR = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;

const validContext = {
  operatorAddress: OPERATOR,
  tokenAddress: TOKEN,
  tokenSymbol: "TKN",
  tokenDecimals: 18,
  depositAmountWei: "1000",
  functionName: "depositWithPermitAndApproveOperator" as const,
};

describe("encodeAddServiceContext / decodeAddServiceContext", () => {
  it("round-trips a valid context", () => {
    expect(decodeAddServiceContext(encodeAddServiceContext(validContext))).toEqual(validContext);
  });

  it.each([
    ["not an object", "nope"],
    ["null", null],
    ["a bad operator address", { ...validContext, operatorAddress: "not-an-address" }],
    ["a bad token address", { ...validContext, tokenAddress: "not-an-address" }],
    ["a non-numeric deposit amount", { ...validContext, depositAmountWei: "1.5" }],
    ["a negative-looking deposit amount", { ...validContext, depositAmountWei: "-1" }],
    ["an unrecognized function name", { ...validContext, functionName: "transfer" }],
    ["a missing tokenSymbol", { ...validContext, tokenSymbol: undefined }],
    ["a NaN tokenDecimals", { ...validContext, tokenDecimals: Number.NaN }],
    ["an infinite tokenDecimals", { ...validContext, tokenDecimals: Number.POSITIVE_INFINITY }],
    ["a negative tokenDecimals", { ...validContext, tokenDecimals: -1 }],
    ["a fractional tokenDecimals", { ...validContext, tokenDecimals: 1.5 }],
  ])("rejects %s", (_label, value) => {
    expect(decodeAddServiceContext(value)).toBeNull();
  });
});

describe("buildIsAddServiceIndexed", () => {
  const CONFIRMED_BLOCK = 1_000n;

  it("queries by lowercased account/operator/token and reports true once an approval exists at or past the confirmed block", async () => {
    const executeQuery = vi
      .fn()
      .mockResolvedValue({ operatorApprovals: [{ id: "0xdead" }], _meta: { block: { number: 1_000 } } });
    const isIndexed = buildIsAddServiceIndexed(executeQuery, OWNER);

    const result = await isIndexed(validContext, CONFIRMED_BLOCK);

    expect(result).toBe(true);
    expect(executeQuery).toHaveBeenCalledWith(expect.any(String), {
      accountId: OWNER.toLowerCase(),
      operatorId: OPERATOR.toLowerCase(),
      tokenId: TOKEN.toLowerCase(),
    });
  });

  it("reports false while the subgraph has no matching approval yet", async () => {
    const executeQuery = vi.fn().mockResolvedValue({ operatorApprovals: [], _meta: { block: { number: 1_000 } } });
    const isIndexed = buildIsAddServiceIndexed(executeQuery, OWNER);

    expect(await isIndexed(validContext, CONFIRMED_BLOCK)).toBe(false);
  });

  it("reports false even when a matching approval already exists, if the indexer hasn't reached the confirmed block yet", async () => {
    // An older matching approval must not complete the new transaction.
    const executeQuery = vi
      .fn()
      .mockResolvedValue({ operatorApprovals: [{ id: "0xdead" }], _meta: { block: { number: 999 } } });
    const isIndexed = buildIsAddServiceIndexed(executeQuery, OWNER);

    expect(await isIndexed(validContext, CONFIRMED_BLOCK)).toBe(false);
  });
});

describe("invalidateAddServiceQueries", () => {
  it("invalidates account-scoped queries regardless of address casing, plus account-summary and the service list", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as unknown as Parameters<typeof invalidateAddServiceQueries>[0];

    await invalidateAddServiceQueries(queryClient, OWNER);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["payments", "account-summary"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["approvedOperatorClients"] });

    const predicateCall = invalidateQueries.mock.calls.find((call) => typeof call[0]?.predicate === "function");
    expect(predicateCall).toBeDefined();
    const predicate = predicateCall?.[0].predicate as (query: { queryKey: unknown[] }) => boolean;

    // Match both address formats used by account queries.
    expect(predicate({ queryKey: ["account", OWNER, "mainnet"] })).toBe(true);
    expect(predicate({ queryKey: ["account", OWNER.toLowerCase(), "approvals", 1, "mainnet"] })).toBe(true);
    // Leave unrelated accounts and query families untouched.
    expect(predicate({ queryKey: ["account", "0x9999999999999999999999999999999999999999"] })).toBe(false);
    expect(predicate({ queryKey: ["operator", OWNER] })).toBe(false);
  });
});
