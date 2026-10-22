import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { assert, describe, test } from "matchstick-as";
import { decodeCommPv2Size } from "../../src/utils/cid";

// Both vectors are well-formed CommPv2 CIDs built directly from the FRC-0069 layout
// (prefix + mhLength varint + padding varint + height byte + 32-byte digest), with an
// arbitrary digest since only the padding/height fields feed the size math.
// 1,000,000-byte raw piece: height 15 (base size 127*2^13 = 1,040,384), padding 40,384.
const COMMP_1_000_000_BYTES = Bytes.fromHexString(
  "0x0155912024c0bb020fabababababababababababababababababababababababababababababababab",
);
// 127-byte raw piece: the smallest tree (height 2), zero padding.
const COMMP_127_BYTES = Bytes.fromHexString(
  "0x01559120220002abababababababababababababababababababababababababababababababab",
);

describe("decodeCommPv2Size", () => {
  test("decodes the unpadded size from a piece with non-zero padding", () => {
    const result = decodeCommPv2Size(COMMP_1_000_000_BYTES);
    assert.assertTrue(result.isValid);
    assert.bigIntEquals(result.unpaddedSize, BigInt.fromI64(1_000_000));
  });

  test("decodes the unpadded size from the smallest tree with zero padding", () => {
    const result = decodeCommPv2Size(COMMP_127_BYTES);
    assert.assertTrue(result.isValid);
    assert.bigIntEquals(result.unpaddedSize, BigInt.fromI32(127));
  });

  test("rejects a CID with the wrong prefix", () => {
    const bytes = Bytes.fromHexString("0x00000000c0bb020fabababababababababababababababababababababababababab");
    const result = decodeCommPv2Size(bytes);
    assert.assertTrue(!result.isValid);
  });

  test("rejects a CID shorter than the prefix", () => {
    const result = decodeCommPv2Size(Bytes.fromHexString("0x0155"));
    assert.assertTrue(!result.isValid);
  });

  test("rejects a truncated multihash", () => {
    // Same as COMMP_127_BYTES but with the last 10 bytes of the digest cut off, so the
    // declared mhLength no longer matches the actual remaining byte count.
    const bytes = Bytes.fromHexString("0x01559120220002abababababababababababababababababababababababababab");
    const result = decodeCommPv2Size(bytes);
    assert.assertTrue(!result.isValid);
  });
});
