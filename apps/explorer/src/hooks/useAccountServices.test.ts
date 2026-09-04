import { describe, expect, it } from "vitest";
import { getAccountOperatorId } from "./useAccountServices";

const PAYER = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x2222222222222222222222222222222222222222";

describe("getAccountOperatorId", () => {
  it("concatenates payer then operator bytes, as the subgraph does", () => {
    expect(getAccountOperatorId(PAYER, OPERATOR)).toBe(`${PAYER}${OPERATOR.slice(2)}`);
  });

  it("produces a 40-byte id", () => {
    // "0x" plus two 20-byte addresses.
    expect(getAccountOperatorId(PAYER, OPERATOR)).toHaveLength(82);
  });

  it("lowercases a checksummed wallet address so it matches the indexed id", () => {
    const checksummed = "0xAbC1111111111111111111111111111111111111";
    const checksummedOperator = "0xDEf2222222222222222222222222222222222222";

    expect(getAccountOperatorId(checksummed, checksummedOperator)).toBe(
      "0xabc1111111111111111111111111111111111111def2222222222222222222222222222222222222",
    );
  });
});
