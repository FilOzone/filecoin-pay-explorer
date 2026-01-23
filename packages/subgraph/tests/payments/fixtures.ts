import { Address, ethereum, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { assert } from "matchstick-as";

import { handleDepositRecorded, handleOperatorApprovalUpdated, handleRailCreated } from "../../src/payments";
import { ONE_BIG_INT } from "../../src/utils/constants";
import {
  getOperatorApprovalEntityId,
  getOperatorTokenEntityId,
  getRailEntityId,
  getUserTokenEntityId,
} from "../../src/utils/keys";

import { createDepositRecordedEvent, createOperatorApprovalUpdatedEvent, createRailCreatedEvent } from "./events";

export function calculateNetworkFee(amount: GraphBN): GraphBN {
  return amount
    .times(PAYMENT_CONSTANTS.NETWORK_FEE_NUMERATOR)
    .plus(PAYMENT_CONSTANTS.NETWORK_FEE_DENOMINATOR.minus(ONE_BIG_INT))
    .div(PAYMENT_CONSTANTS.NETWORK_FEE_DENOMINATOR);
}

export function calculateOperatorCommission(amount: GraphBN, commissionRateBps: GraphBN): GraphBN {
  return amount.times(commissionRateBps).div(PAYMENT_CONSTANTS.COMMISSION_MAX_BPS);
}

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

export class PAYMENT_CONSTANTS {
  static NETWORK_FEE_NUMERATOR: GraphBN = GraphBN.fromI64(1);
  static NETWORK_FEE_DENOMINATOR: GraphBN = GraphBN.fromI64(200);
  static COMMISSION_MAX_BPS: GraphBN = GraphBN.fromI64(10_000);
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
export function assertOperatorLockupCleared(operator: Address, token: Address): void {
  const operatorApprovalId = getOperatorApprovalEntityId(TEST_ADDRESSES.ACCOUNT, operator, token).toHex();
  const operatorTokenId = getOperatorTokenEntityId(operator, token).toHex();
  assert.fieldEquals("OperatorApproval", operatorApprovalId, "lockupUsage", "0");
  assert.fieldEquals("OperatorToken", operatorTokenId, "lockupUsage", "0");
}

export function assertTokenState(
  tokenAddress: Address,
  name: string,
  symbol: string,
  decimals: string,
  userFunds: GraphBN,
  totalDeposits: GraphBN,
  volume: GraphBN,
  totalUsers: string,
  totalWithdrawals: string,
): void {
  const tokenId = tokenAddress.toHexString();
  assert.fieldEquals("Token", tokenId, "name", name);
  assert.fieldEquals("Token", tokenId, "symbol", symbol);
  assert.fieldEquals("Token", tokenId, "decimals", decimals);
  assert.fieldEquals("Token", tokenId, "userFunds", userFunds.toString());
  assert.fieldEquals("Token", tokenId, "totalDeposits", totalDeposits.toString());
  assert.fieldEquals("Token", tokenId, "volume", volume.toString());
  assert.fieldEquals("Token", tokenId, "totalUsers", totalUsers);
  assert.fieldEquals("Token", tokenId, "totalWithdrawals", totalWithdrawals);
}

export function assertAccountState(accountAddress: Address, totalTokens: string): void {
  const accountId = accountAddress.toHexString();
  assert.fieldEquals("Account", accountId, "address", accountId);
  assert.fieldEquals("Account", accountId, "totalTokens", totalTokens);
}

export function assertUserTokenState(
  accountAddress: Address,
  tokenAddress: Address,
  funds: GraphBN,
  payout: string,
  fundsCollected: string,
): void {
  const userTokenId = getUserTokenEntityId(accountAddress, tokenAddress).toHexString();
  assert.fieldEquals("UserToken", userTokenId, "funds", funds.toString());
  assert.fieldEquals("UserToken", userTokenId, "payout", payout);
  assert.fieldEquals("UserToken", userTokenId, "fundsCollected", fundsCollected);
}

export function assertOperatorState(operatorAddress: Address, totalApprovals: string, totalTokens: string): void {
  const operatorId = operatorAddress.toHexString();
  assert.fieldEquals("Operator", operatorId, "address", operatorId);
  assert.fieldEquals("Operator", operatorId, "totalApprovals", totalApprovals);
  assert.fieldEquals("Operator", operatorId, "totalTokens", totalTokens);
}

export function assertOperatorTokenState(
  operatorAddress: Address,
  tokenAddress: Address,
  lockupUsage: string,
  rateUsage: string,
): void {
  const operatorTokenId = getOperatorTokenEntityId(operatorAddress, tokenAddress).toHexString();
  assert.fieldEquals("OperatorToken", operatorTokenId, "lockupUsage", lockupUsage);
  assert.fieldEquals("OperatorToken", operatorTokenId, "rateUsage", rateUsage);
}

export function assertOperatorApprovalState(
  accountAddress: Address,
  operatorAddress: Address,
  tokenAddress: Address,
  isApproved: string,
  rateAllowance: GraphBN,
  lockupAllowance: GraphBN,
  maxLockupPeriod: GraphBN,
  lockupUsage: string,
  rateUsage: string,
): void {
  const operatorApprovalId = getOperatorApprovalEntityId(accountAddress, operatorAddress, tokenAddress).toHexString();
  assert.fieldEquals("OperatorApproval", operatorApprovalId, "isApproved", isApproved);
  assert.fieldEquals("OperatorApproval", operatorApprovalId, "rateAllowance", rateAllowance.toString());
  assert.fieldEquals("OperatorApproval", operatorApprovalId, "lockupAllowance", lockupAllowance.toString());
  assert.fieldEquals("OperatorApproval", operatorApprovalId, "maxLockupPeriod", maxLockupPeriod.toString());
  assert.fieldEquals("OperatorApproval", operatorApprovalId, "lockupUsage", lockupUsage);
  assert.fieldEquals("OperatorApproval", operatorApprovalId, "rateUsage", rateUsage);
}

export function assertRailParams(
  railId: GraphBN,
  state: string,
  payer: Address,
  payee: Address,
  arbiter: Address,
  serviceFeeRecipient: Address,
  commissionRateBps: GraphBN,
  totalSettledAmount: string,
  totalNetPayeeAmount: string,
  totalCommission: string,
  totalSettlements: string,
): void {
  const railEntityId = getRailEntityId(railId).toHex();
  assert.fieldEquals("Rail", railEntityId, "state", state);
  assert.fieldEquals("Rail", railEntityId, "payer", payer.toHex());
  assert.fieldEquals("Rail", railEntityId, "payee", payee.toHex());
  assert.fieldEquals("Rail", railEntityId, "arbiter", arbiter.toHex());
  assert.fieldEquals("Rail", railEntityId, "serviceFeeRecipient", serviceFeeRecipient.toHex());
  assert.fieldEquals("Rail", railEntityId, "commissionRateBps", commissionRateBps.toString());
  assert.fieldEquals("Rail", railEntityId, "totalSettledAmount", totalSettledAmount);
  assert.fieldEquals("Rail", railEntityId, "totalNetPayeeAmount", totalNetPayeeAmount);
  assert.fieldEquals("Rail", railEntityId, "totalCommission", totalCommission);
  assert.fieldEquals("Rail", railEntityId, "totalSettlements", totalSettlements);
}

export function assertRailRateParams(railId: GraphBN, state: string, paymentRate: GraphBN, settledUpto: string): void {
  const railEntityId = getRailEntityId(railId).toHex();
  assert.fieldEquals("Rail", railEntityId, "state", state);
  assert.fieldEquals("Rail", railEntityId, "paymentRate", paymentRate.toString());
  assert.fieldEquals("Rail", railEntityId, "settledUpto", settledUpto);
}

export function assertRailLockupParams(railId: GraphBN, lockupPeriod: GraphBN, lockupFixed: GraphBN): void {
  const railEntityId = getRailEntityId(railId).toHex();
  assert.fieldEquals("Rail", railEntityId, "lockupPeriod", lockupPeriod.toString());
  assert.fieldEquals("Rail", railEntityId, "lockupFixed", lockupFixed.toString());
}
