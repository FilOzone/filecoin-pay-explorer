import { Address, ethereum, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { assert } from "matchstick-as";

import { handleDepositRecorded, handleOperatorApprovalUpdated, handleRailCreated } from "../../src/payments";
import {
  getOperatorApprovalEntityId,
  getOperatorTokenEntityId,
  getRailEntityId,
  getUserTokenEntityId,
} from "../../src/utils/keys";

import { createDepositRecordedEvent, createOperatorApprovalUpdatedEvent, createRailCreatedEvent } from "./events";

// Test Fixtures and Constants
export class TEST_AMOUNTS {
  static SMALL_DEPOSIT: GraphBN = GraphBN.fromI64(1_000_000_000_000_000); // 0.001 FIL
  static MEDIUM_DEPOSIT: GraphBN = GraphBN.fromI64(5_000_000_000_000_000); // 0.005 FIL
  static LARGE_DEPOSIT: GraphBN = GraphBN.fromI64(10_000_000_000_000_000); // 0.01 FIL
  static XLARGE_DEPOSIT: GraphBN = GraphBN.fromI64(20_000_000_000_000_000); // 0.02 FIL
  static PAYMENT_RATE_LOW: GraphBN = GraphBN.fromI64(50_000_000); // 0.00005 <rail.token>/epoch
  static PAYMENT_RATE_MEDIUM: GraphBN = GraphBN.fromI64(100_000_000); // 0.0001 <rail.token>/epoch
  static PAYMENT_RATE_HIGH: GraphBN = GraphBN.fromI64(200_000_000); // 0.0002 <rail.token>/epoch
  static LOCKUP_FIXED_SMALL: GraphBN = GraphBN.fromI64(5_000_000_000_000); // 0.000005 <rail.token>
  static LOCKUP_FIXED_MEDIUM: GraphBN = GraphBN.fromI64(1_000_000_000_000); // 0.000001 <rail.token>
}

export class TEST_ADDRESSES {
  static TOKEN: Address = Address.fromString("0x0000000000000000000000000000000000000001");
  static ACCOUNT: Address = Address.fromString("0x0000000000000000000000000000000000000002");
  static OPERATOR: Address = Address.fromString("0x0000000000000000000000000000000000000003");
  static PAYEE: Address = Address.fromString("0x0000000000000000000000000000000000000004");
  static VALIDATOR: Address = Address.fromString("0x0000000000000000000000000000000000000005");
  static SERVICE_FEE_RECIPIENT: Address = Address.fromString("0x0000000000000000000000000000000000000006");
}

export class TEST_ALLOWANCES {
  static RATE: GraphBN = GraphBN.fromI64(1_000_000_000);
  static LOCKUP: GraphBN = GraphBN.fromI64(100_000_000_000_000_000);
  static MAX_LOCKUP_PERIOD: GraphBN = GraphBN.fromI64(86400);
}

// Setup Helper Functions
export function setupDeposit(amount: GraphBN): void {
  const event = createDepositRecordedEvent(
    TEST_ADDRESSES.TOKEN,
    TEST_ADDRESSES.ACCOUNT,
    TEST_ADDRESSES.ACCOUNT,
    amount,
  );
  handleDepositRecorded(event);
}

export function setupOperatorApproval(
  rateAllowance: GraphBN = TEST_ALLOWANCES.RATE,
  lockupAllowance: GraphBN = TEST_ALLOWANCES.LOCKUP,
  maxLockupPeriod: GraphBN = TEST_ALLOWANCES.MAX_LOCKUP_PERIOD,
): void {
  const event = createOperatorApprovalUpdatedEvent(
    TEST_ADDRESSES.TOKEN,
    TEST_ADDRESSES.ACCOUNT,
    TEST_ADDRESSES.OPERATOR,
    true,
    rateAllowance,
    lockupAllowance,
    maxLockupPeriod,
  );
  handleOperatorApprovalUpdated(event);
}

export class RailSetupResult {
  constructor(
    public railId: GraphBN,
    public validator: Address,
    public serviceFeeRecipient: Address,
    public commissionRateBps: GraphBN,
    public railCreatedEvent: ethereum.Event,
  ) {}
}

export function setupRail(railId: GraphBN, commissionRateBps: GraphBN): RailSetupResult {
  const validator = TEST_ADDRESSES.VALIDATOR;
  const serviceFeeRecipient = TEST_ADDRESSES.SERVICE_FEE_RECIPIENT;

  const railCreatedEvent = createRailCreatedEvent(
    railId,
    TEST_ADDRESSES.ACCOUNT,
    TEST_ADDRESSES.PAYEE,
    validator,
    TEST_ADDRESSES.TOKEN,
    TEST_ADDRESSES.OPERATOR,
    serviceFeeRecipient,
    commissionRateBps,
  );
  handleRailCreated(railCreatedEvent);

  return new RailSetupResult(railId, validator, serviceFeeRecipient, commissionRateBps, railCreatedEvent);
}

export function setupCompleteRail(
  depositAmount: GraphBN,
  railId: GraphBN,
  commissionRateBps: GraphBN,
): RailSetupResult {
  setupDeposit(depositAmount);
  setupOperatorApproval();
  return setupRail(railId, commissionRateBps);
}

// Assertion Helper Functions
export function assertRailState(railId: GraphBN, expectedState: string): void {
  const railEntityId = getRailEntityId(railId).toHex();
  assert.fieldEquals("Rail", railEntityId, "state", expectedState);
}

export function assertUserTokenFunds(account: Address, token: Address, expectedFunds: GraphBN): void {
  const userTokenId = getUserTokenEntityId(account, token).toHex();
  assert.fieldEquals("UserToken", userTokenId, "funds", expectedFunds.toString());
}

export function assertOperatorLockupCleared(operator: Address, token: Address): void {
  const operatorApprovalId = getOperatorApprovalEntityId(TEST_ADDRESSES.ACCOUNT, operator, token).toHex();
  const operatorTokenId = getOperatorTokenEntityId(operator, token).toHex();
  assert.fieldEquals("OperatorApproval", operatorApprovalId, "lockupUsage", "0");
  assert.fieldEquals("OperatorToken", operatorTokenId, "lockupUsage", "0");
}
