import { BigInt, Bytes } from "@graphprotocol/graph-ts";

// CommPv2 piece CIDs (FRC-0069) start with a fixed prefix: CIDv1 (0x01), raw
// codec (0x55), and the fr32-sha256-trunc254-padded-binary-tree multihash
// code (0x1011, varint-encoded as 0x91 0x20).
const COMMP_V2_PREFIX: u8[] = [0x01, 0x55, 0x91, 0x20];
const MIN_MULTIHASH_LENGTH = 34; // 1 padding byte (minimum) + 1 height byte + 32-byte digest

class Uvarint {
  constructor(
    public value: BigInt,
    public nextOffset: i32,
  ) {}
}

// Reads a protobuf-style unsigned varint starting at `offset`. Returns null if it runs
// past the end of `data` or exceeds the 10 bytes a 64-bit varint can take.
function readUvarint(data: Bytes, offset: i32): Uvarint | null {
  let i = 0;
  let value = BigInt.zero();
  while (true) {
    if (offset + i >= data.length || i >= 10) return null;
    const byte = data[offset + i];
    value = value.bitOr(BigInt.fromU32(u32(byte & 0x7f)).leftShift(u8(i * 7)));
    i++;
    if (byte < 0x80) break;
  }
  return new Uvarint(value, offset + i);
}

export class CommPv2Size {
  constructor(
    public isValid: boolean,
    public unpaddedSize: BigInt = BigInt.zero(),
  ) {}
}

/**
 * Decodes the unpadded piece size directly out of a CommPv2 piece CID, without an eth_call:
 * the multihash digest encodes a merkle tree `height` and a `padding` varint, and
 * unpaddedSize = 127 * 2^(height - 2) - padding.
 * https://github.com/filecoin-project/FIPs/blob/master/FRCs/frc-0069.md
 */
export function decodeCommPv2Size(cidData: Bytes): CommPv2Size {
  if (cidData.length < 4) return new CommPv2Size(false);
  for (let i = 0; i < 4; i++) {
    if (cidData[i] != COMMP_V2_PREFIX[i]) return new CommPv2Size(false);
  }

  const mhLength = readUvarint(cidData, 4);
  if (mhLength == null) return new CommPv2Size(false);
  if (mhLength.value.lt(BigInt.fromI32(MIN_MULTIHASH_LENGTH))) return new CommPv2Size(false);
  if (mhLength.value.plus(BigInt.fromI32(mhLength.nextOffset)).notEqual(BigInt.fromI32(cidData.length))) {
    return new CommPv2Size(false);
  }

  const padding = readUvarint(cidData, mhLength.nextOffset);
  if (padding == null) return new CommPv2Size(false);
  if (padding.nextOffset >= cidData.length) return new CommPv2Size(false);

  const height = cidData[padding.nextOffset];
  // height < 2 would underflow the u8 shift amount below; height > 58 would overflow
  // any realistic piece size. Both indicate a malformed CID.
  if (height < 2 || height > 58) return new CommPv2Size(false);

  const baseSize = BigInt.fromI32(127).leftShift(u8(height - 2));
  if (padding.value.gt(baseSize)) return new CommPv2Size(false);

  return new CommPv2Size(true, baseSize.minus(padding.value));
}
