import { BigInt as GraphBN, ethereum, Address } from "@graphprotocol/graph-ts";
// eslint-disable-next-line import/no-extraneous-dependencies
import { newMockEvent } from "matchstick-as";

import {
  DepositRecorded,
  WithdrawRecorded,
  RailCreated,
  OperatorApprovalUpdated,
  AccountLockupSettled,
} from "../../generated/Payments/Payments";

export function createDepositRecordedEvent(
  token: Address,
  from: Address,
  to: Address,
  amount: GraphBN,
  isLockup: boolean,
): DepositRecorded {
  const event = changetype<DepositRecorded>(newMockEvent());

  event.parameters.push(new ethereum.EventParam("token", ethereum.Value.fromAddress(token)));
  event.parameters.push(new ethereum.EventParam("from", ethereum.Value.fromAddress(from)));
  event.parameters.push(new ethereum.EventParam("to", ethereum.Value.fromAddress(to)));
  event.parameters.push(new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount)));
  event.parameters.push(new ethereum.EventParam("isLockup", ethereum.Value.fromBoolean(isLockup)));

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
  payee: Address,
  payer: Address,
  validator: Address,
  token: Address,
  operator: Address,
  serviceFeeRecipient: Address,
  commissionRateBps: GraphBN,
): RailCreated {
  const event = changetype<RailCreated>(newMockEvent());

  event.parameters.push(new ethereum.EventParam("railId", ethereum.Value.fromUnsignedBigInt(railId)));
  event.parameters.push(new ethereum.EventParam("payee", ethereum.Value.fromAddress(payee)));
  event.parameters.push(new ethereum.EventParam("payer", ethereum.Value.fromAddress(payer)));
  event.parameters.push(new ethereum.EventParam("validator", ethereum.Value.fromAddress(validator)));
  event.parameters.push(new ethereum.EventParam("token", ethereum.Value.fromAddress(token)));
  event.parameters.push(new ethereum.EventParam("operator", ethereum.Value.fromAddress(operator)));
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
