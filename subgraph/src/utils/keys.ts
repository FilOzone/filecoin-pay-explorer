import { Bytes, BigInt, Address } from "@graphprotocol/graph-ts";
import { PAYMENTS_NETWORK_STATS_ID } from "./metrics";

export function getRailEntityId(railId: BigInt): Bytes {
  return Bytes.fromByteArray(Bytes.fromBigInt(railId));
}

export function getUserTokenEntityId(account: Address, token: Address): Bytes {
  return account.concat(token);
}

export function getOperatorApprovalEntityId(client: Address, operator: Address, token: Address): Bytes {
  return client.concat(operator).concat(token);
}

export function getRateChangeQueueEntityId(railId: BigInt, startEpoch: BigInt): Bytes {
  return getRailEntityId(railId).concat(Bytes.fromByteArray(Bytes.fromBigInt(startEpoch)));
}

export function getSettlementEntityId(railId: BigInt, settledUpto: BigInt): Bytes {
  return getRailEntityId(railId).concat(Bytes.fromByteArray(Bytes.fromBigInt(settledUpto)));
}

export function getPaymentsMetricEntityId(): Bytes {
  return Bytes.fromUTF8(PAYMENTS_NETWORK_STATS_ID);
}
