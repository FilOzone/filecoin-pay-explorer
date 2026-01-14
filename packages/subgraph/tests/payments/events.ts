import { Address, ethereum, BigInt as GraphBN } from "@graphprotocol/graph-ts";
// eslint-disable-next-line import/no-extraneous-dependencies
import { newMockEvent } from "matchstick-as";

import {
  AccountLockupSettled,
  DepositRecorded,
  OperatorApprovalUpdated,
  RailCreated,
  RailFinalized,
  RailLockupModified,
  RailOneTimePaymentProcessed,
  RailRateModified,
  RailSettled,
  RailTerminated,
  WithdrawRecorded,
} from "../../generated/Payments/Payments";

export function createDepositRecordedEvent(
  token: Address,
  from: Address,
  to: Address,
  amount: GraphBN,
): DepositRecorded {
  const event = changetype<DepositRecorded>(newMockEvent());

  event.parameters.push(new ethereum.EventParam("token", ethereum.Value.fromAddress(token)));
  event.parameters.push(new ethereum.EventParam("from", ethereum.Value.fromAddress(from)));
  event.parameters.push(new ethereum.EventParam("to", ethereum.Value.fromAddress(to)));
  event.parameters.push(new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount)));

  return event;
}

export function createWithdrawRecordedEvent(
  token: Address,
  from: Address,
  to: Address,
  amount: GraphBN,
): WithdrawRecorded {
  const event = changetype<WithdrawRecorded>(newMockEvent());

  event.parameters.push(new ethereum.EventParam("token", ethereum.Value.fromAddress(token)));
  event.parameters.push(new ethereum.EventParam("from", ethereum.Value.fromAddress(from)));
  event.parameters.push(new ethereum.EventParam("to", ethereum.Value.fromAddress(to)));
  event.parameters.push(new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount)));

  return event;
}

export function createRailCreatedEvent(
  railId: GraphBN,
  payer: Address,
  payee: Address,
  validator: Address,
  token: Address,
  operator: Address,
  serviceFeeRecipient: Address,
  commissionRateBps: GraphBN,
): RailCreated {
  const event = changetype<RailCreated>(newMockEvent());

  event.parameters.push(new ethereum.EventParam("railId", ethereum.Value.fromUnsignedBigInt(railId)));
  event.parameters.push(new ethereum.EventParam("payer", ethereum.Value.fromAddress(payer)));
  event.parameters.push(new ethereum.EventParam("payee", ethereum.Value.fromAddress(payee)));
  event.parameters.push(new ethereum.EventParam("token", ethereum.Value.fromAddress(token)));
  event.parameters.push(new ethereum.EventParam("operator", ethereum.Value.fromAddress(operator)));
  event.parameters.push(new ethereum.EventParam("validator", ethereum.Value.fromAddress(validator)));
  event.parameters.push(
    new ethereum.EventParam("serviceFeeRecipient", ethereum.Value.fromAddress(serviceFeeRecipient)),
  );
  event.parameters.push(
    new ethereum.EventParam("commissionRateBps", ethereum.Value.fromUnsignedBigInt(commissionRateBps)),
  );

  return event;
}

export function createOperatorApprovalUpdatedEvent(
  token: Address,
  client: Address,
  operator: Address,
  approved: boolean,
  rateAllowance: GraphBN,
  lockupAllowance: GraphBN,
  maxLockupPeriod: GraphBN,
): OperatorApprovalUpdated {
  const event = changetype<OperatorApprovalUpdated>(newMockEvent());

  event.parameters.push(new ethereum.EventParam("token", ethereum.Value.fromAddress(token)));
  event.parameters.push(new ethereum.EventParam("client", ethereum.Value.fromAddress(client)));
  event.parameters.push(new ethereum.EventParam("operator", ethereum.Value.fromAddress(operator)));
  event.parameters.push(new ethereum.EventParam("approved", ethereum.Value.fromBoolean(approved)));
  event.parameters.push(new ethereum.EventParam("rateAllowance", ethereum.Value.fromUnsignedBigInt(rateAllowance)));
  event.parameters.push(new ethereum.EventParam("lockupAllowance", ethereum.Value.fromUnsignedBigInt(lockupAllowance)));
  event.parameters.push(new ethereum.EventParam("maxLockupPeriod", ethereum.Value.fromUnsignedBigInt(maxLockupPeriod)));

  return event;
}

export function createAccountLockupSettledEvent(
  token: Address,
  owner: Address,
  lockupCurrent: GraphBN,
  lockupRate: GraphBN,
  lockupLastSettledAt: GraphBN,
): AccountLockupSettled {
  const event = changetype<AccountLockupSettled>(newMockEvent());

  event.parameters.push(new ethereum.EventParam("token", ethereum.Value.fromAddress(token)));
  event.parameters.push(new ethereum.EventParam("owner", ethereum.Value.fromAddress(owner)));
  event.parameters.push(new ethereum.EventParam("lockupCurrent", ethereum.Value.fromUnsignedBigInt(lockupCurrent)));
  event.parameters.push(new ethereum.EventParam("lockupRate", ethereum.Value.fromUnsignedBigInt(lockupRate)));
  event.parameters.push(
    new ethereum.EventParam("lockupLastSettledAt", ethereum.Value.fromUnsignedBigInt(lockupLastSettledAt)),
  );

  return event;
}

export function createRailOneTimePaymentProcessedEvent(
  railId: GraphBN,
  netPayeeAmount: GraphBN,
  operatorCommission: GraphBN,
  networkFee: GraphBN,
): RailOneTimePaymentProcessed {
  const event = changetype<RailOneTimePaymentProcessed>(newMockEvent());

  event.parameters.push(new ethereum.EventParam("railId", ethereum.Value.fromUnsignedBigInt(railId)));
  event.parameters.push(new ethereum.EventParam("netPayeeAmount", ethereum.Value.fromUnsignedBigInt(netPayeeAmount)));
  event.parameters.push(
    new ethereum.EventParam("operatorCommission", ethereum.Value.fromUnsignedBigInt(operatorCommission)),
  );
  event.parameters.push(new ethereum.EventParam("networkFee", ethereum.Value.fromUnsignedBigInt(networkFee)));

  return event;
}

export function createRailLockupModifiedEvent(
  railId: GraphBN,
  oldLockupPeriod: GraphBN,
  newLockupPeriod: GraphBN,
  oldLockupFixed: GraphBN,
  newLockupFixed: GraphBN,
): RailLockupModified {
  const event = changetype<RailLockupModified>(newMockEvent());

  event.parameters.push(new ethereum.EventParam("railId", ethereum.Value.fromUnsignedBigInt(railId)));
  event.parameters.push(new ethereum.EventParam("oldLockupPeriod", ethereum.Value.fromUnsignedBigInt(oldLockupPeriod)));
  event.parameters.push(new ethereum.EventParam("newLockupPeriod", ethereum.Value.fromUnsignedBigInt(newLockupPeriod)));
  event.parameters.push(new ethereum.EventParam("oldLockupFixed", ethereum.Value.fromUnsignedBigInt(oldLockupFixed)));
  event.parameters.push(new ethereum.EventParam("newLockupFixed", ethereum.Value.fromUnsignedBigInt(newLockupFixed)));

  return event;
}

export function createRailRateModifiedEvent(railId: GraphBN, oldRate: GraphBN, newRate: GraphBN): RailRateModified {
  const event = changetype<RailRateModified>(newMockEvent());

  event.parameters.push(new ethereum.EventParam("railId", ethereum.Value.fromUnsignedBigInt(railId)));
  event.parameters.push(new ethereum.EventParam("oldRate", ethereum.Value.fromUnsignedBigInt(oldRate)));
  event.parameters.push(new ethereum.EventParam("newRate", ethereum.Value.fromUnsignedBigInt(newRate)));

  return event;
}

export function createRailSettledEvent(
  railId: GraphBN,
  totalSettleAmount: GraphBN,
  totalNetPayeeAmount: GraphBN,
  operatorCommission: GraphBN,
  networkFee: GraphBN,
  settledUpto: GraphBN,
): RailSettled {
  const event = changetype<RailSettled>(newMockEvent());

  event.parameters.push(new ethereum.EventParam("railId", ethereum.Value.fromUnsignedBigInt(railId)));
  event.parameters.push(
    new ethereum.EventParam("totalSettleAmount", ethereum.Value.fromUnsignedBigInt(totalSettleAmount)),
  );
  event.parameters.push(
    new ethereum.EventParam("totalNetPayeeAmount", ethereum.Value.fromUnsignedBigInt(totalNetPayeeAmount)),
  );
  event.parameters.push(
    new ethereum.EventParam("operatorCommission", ethereum.Value.fromUnsignedBigInt(operatorCommission)),
  );
  event.parameters.push(new ethereum.EventParam("networkFee", ethereum.Value.fromUnsignedBigInt(networkFee)));
  event.parameters.push(new ethereum.EventParam("settledUpto", ethereum.Value.fromUnsignedBigInt(settledUpto)));

  return event;
}

export function createRailTerminatedEvent(railId: GraphBN, by: Address, endEpoch: GraphBN): RailTerminated {
  const event = changetype<RailTerminated>(newMockEvent());

  event.parameters.push(new ethereum.EventParam("railId", ethereum.Value.fromUnsignedBigInt(railId)));
  event.parameters.push(new ethereum.EventParam("by", ethereum.Value.fromAddress(by)));
  event.parameters.push(new ethereum.EventParam("endEpoch", ethereum.Value.fromUnsignedBigInt(endEpoch)));

  return event;
}

export function createRailFinalizedEvent(railId: GraphBN): RailFinalized {
  const event = changetype<RailFinalized>(newMockEvent());

  event.parameters.push(new ethereum.EventParam("railId", ethereum.Value.fromUnsignedBigInt(railId)));

  return event;
}
