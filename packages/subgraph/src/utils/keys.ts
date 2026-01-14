import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { PAYMENTS_NETWORK_STATS_ID } from "./metrics";

export function getRailEntityId(railId: BigInt): Bytes {
  return Bytes.fromByteArray(Bytes.fromBigInt(railId));
}

export function getUserTokenEntityId(account: Bytes, token: Bytes): Bytes {
  return account.concat(token);
}

export function getOperatorTokenEntityId(operator: Bytes, token: Bytes): Bytes {
  return operator.concat(token);
}

export function getOperatorApprovalEntityId(client: Bytes, operator: Bytes, token: Bytes): Bytes {
  return client.concat(operator).concat(token);
}

export function getRateChangeQueueEntityId(railId: BigInt, startEpoch: BigInt): Bytes {
  return getRailEntityId(railId).concat(Bytes.fromByteArray(Bytes.fromBigInt(startEpoch)));
}

export function getSettlementEntityId(txHash: Bytes, logIndex: BigInt): Bytes {
  return txHash.concatI32(logIndex.toI32());
}

export function getPaymentsMetricEntityId(): Bytes {
  return Bytes.fromUTF8(PAYMENTS_NETWORK_STATS_ID);
}
