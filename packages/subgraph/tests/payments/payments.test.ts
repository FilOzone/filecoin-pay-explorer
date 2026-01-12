/* eslint-disable no-underscore-dangle, @typescript-eslint/no-unnecessary-type-assertion */
import { ethereum, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { afterEach, assert, beforeAll, clearStore, describe, test } from "matchstick-as";

import { Account, Operator, OperatorApproval, Rail, Token, UserToken } from "../../generated/schema";
import {
  handleAccountLockupSettled,
  handleDepositRecorded,
  handleOperatorApprovalUpdated,
  handleRailCreated,
  handleRailFinalized,
  handleRailLockupModified,
  handleRailOneTimePaymentProcessed,
  handleRailRateModified,
  handleRailSettled,
  handleRailTerminated,
  handleWithdrawRecorded,
} from "../../src/payments";
import { ONE_BIG_INT } from "../../src/utils/constants";
import {
  getOperatorApprovalEntityId,
  getOperatorTokenEntityId,
  getRailEntityId,
  getSettlementEntityId,
  getUserTokenEntityId,
} from "../../src/utils/keys";
import { ZERO_BIG_INT } from "../../src/utils/metrics";
import { mockERC20Contract } from "../mocks";
import {
  createAccountLockupSettledEvent,
  createDepositRecordedEvent,
  createOperatorApprovalUpdatedEvent,
  createRailFinalizedEvent,
  createRailLockupModifiedEvent,
  createRailOneTimePaymentProcessedEvent,
  createRailRateModifiedEvent,
  createRailSettledEvent,
  createRailTerminatedEvent,
  createWithdrawRecordedEvent,
} from "./events";
import {
  assertOperatorLockupCleared,
  assertRailState,
  assertUserTokenFunds,
  setupCompleteRail,
  setupDeposit,
  setupOperatorApproval,
  setupRail,
  TEST_ADDRESSES,
  TEST_ALLOWANCES,
  TEST_AMOUNTS,
} from "./fixtures";

export {
  handleDepositRecorded,
  handleWithdrawRecorded,
  handleRailCreated,
  handleOperatorApprovalUpdated,
  handleAccountLockupSettled,
};

describe("Payments", () => {
  beforeAll(() => {
    mockERC20Contract(TEST_ADDRESSES.TOKEN, "Test Token", "TEST", 18);
  });

  afterEach(() => {
    clearStore();
  });

  test("should handle deposit recorded properly", () => {
    const depositAmount = GraphBN.fromI32(1000);
    const event = createDepositRecordedEvent(
      TEST_ADDRESSES.TOKEN,
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.ACCOUNT,
      depositAmount,
    );

    handleDepositRecorded(event);

    const token = Token.load(TEST_ADDRESSES.TOKEN);
    assert.assertNotNull(token);
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "name", "Test Token");
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "symbol", "TEST");
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "decimals", "18");
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "userFunds", depositAmount.toString());
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "totalDeposits", depositAmount.toString());
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "volume", depositAmount.toString());
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "totalUsers", "1");
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "totalWithdrawals", "0");

    const account = Account.load(TEST_ADDRESSES.ACCOUNT);
    assert.assertNotNull(account);
    assert.fieldEquals(
      "Account",
      TEST_ADDRESSES.ACCOUNT.toHexString(),
      "address",
      TEST_ADDRESSES.ACCOUNT.toHexString(),
    );
    assert.fieldEquals("Account", TEST_ADDRESSES.ACCOUNT.toHexString(), "totalTokens", "1");

    const userTokenId = getUserTokenEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN);
    const userToken = UserToken.load(userTokenId);
    assert.assertNotNull(userToken);
    assert.fieldEquals("UserToken", userTokenId.toHexString(), "funds", depositAmount.toString());
    assert.fieldEquals("UserToken", userTokenId.toHexString(), "payout", "0");
    assert.fieldEquals("UserToken", userTokenId.toHexString(), "fundsCollected", "0");
  });

  test("should handle withdraw recorded properly", () => {
    const depositAmount = GraphBN.fromI32(1000);
    const withdrawAmount = GraphBN.fromI32(500);

    const depositEvent = createDepositRecordedEvent(
      TEST_ADDRESSES.TOKEN,
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.ACCOUNT,
      depositAmount,
    );

    const withdrawEvent = createWithdrawRecordedEvent(
      TEST_ADDRESSES.TOKEN,
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.ACCOUNT,
      withdrawAmount,
    );

    handleDepositRecorded(depositEvent);
    handleWithdrawRecorded(withdrawEvent);

    const userTokenIdStr = getUserTokenEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN).toHexString();
    const expectedFunds = depositAmount.minus(withdrawAmount);
    assert.fieldEquals("UserToken", userTokenIdStr, "funds", expectedFunds.toString());

    const expectedUserFunds = depositAmount.minus(withdrawAmount);
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "userFunds", expectedUserFunds.toString());
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "totalWithdrawals", withdrawAmount.toString());

    const expectedVolume = depositAmount.plus(withdrawAmount);
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "volume", expectedVolume.toString());
  });

  test("should handle operator approval updated properly", () => {
    const rateAllowance = GraphBN.fromI32(100);
    const lockupAllowance = GraphBN.fromI32(5000);
    const maxLockupPeriod = GraphBN.fromI32(86400);

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

    const operator = Operator.load(TEST_ADDRESSES.OPERATOR);
    assert.assertNotNull(operator);
    assert.fieldEquals(
      "Operator",
      TEST_ADDRESSES.OPERATOR.toHexString(),
      "address",
      TEST_ADDRESSES.OPERATOR.toHexString(),
    );
    assert.fieldEquals("Operator", TEST_ADDRESSES.OPERATOR.toHexString(), "totalApprovals", "1");
    assert.fieldEquals("Operator", TEST_ADDRESSES.OPERATOR.toHexString(), "totalTokens", "1");

    const operatorTokenId = getOperatorTokenEntityId(TEST_ADDRESSES.OPERATOR, TEST_ADDRESSES.TOKEN);
    assert.fieldEquals("OperatorToken", operatorTokenId.toHexString(), "lockupUsage", "0");
    assert.fieldEquals("OperatorToken", operatorTokenId.toHexString(), "rateUsage", "0");

    const operatorApprovalId = getOperatorApprovalEntityId(
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
    );
    const operatorApproval = OperatorApproval.load(operatorApprovalId);
    assert.assertNotNull(operatorApproval);
    assert.fieldEquals("OperatorApproval", operatorApprovalId.toHexString(), "isApproved", "true");
    assert.fieldEquals("OperatorApproval", operatorApprovalId.toHexString(), "rateAllowance", rateAllowance.toString());
    assert.fieldEquals(
      "OperatorApproval",
      operatorApprovalId.toHexString(),
      "lockupAllowance",
      lockupAllowance.toString(),
    );
    assert.fieldEquals(
      "OperatorApproval",
      operatorApprovalId.toHexString(),
      "maxLockupPeriod",
      maxLockupPeriod.toString(),
    );
    assert.fieldEquals("OperatorApproval", operatorApprovalId.toHexString(), "lockupUsage", "0");
    assert.fieldEquals("OperatorApproval", operatorApprovalId.toHexString(), "rateUsage", "0");
  });

  test("should handle account lockup settled properly", () => {
    const depositAmount = GraphBN.fromI32(1000);
    const depositEvent = createDepositRecordedEvent(
      TEST_ADDRESSES.TOKEN,
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.ACCOUNT,
      depositAmount,
    );
    handleDepositRecorded(depositEvent);

    const lockupCurrent = GraphBN.fromI32(500);
    const lockupRate = GraphBN.fromI32(10);
    const lockupLastSettledAt = GraphBN.fromI32(1234567890);

    const event = createAccountLockupSettledEvent(
      TEST_ADDRESSES.TOKEN,
      TEST_ADDRESSES.ACCOUNT,
      lockupCurrent,
      lockupRate,
      lockupLastSettledAt,
    );

    handleAccountLockupSettled(event);

    const userTokenIdStr = getUserTokenEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN).toHexString();
    assert.fieldEquals("UserToken", userTokenIdStr, "lockupCurrent", lockupCurrent.toString());
    assert.fieldEquals("UserToken", userTokenIdStr, "lockupRate", lockupRate.toString());
    assert.fieldEquals("UserToken", userTokenIdStr, "lockupLastSettledUntilEpoch", lockupLastSettledAt.toString());
  });

  test("should handle rail created properly", () => {
    const railId = GraphBN.fromI32(1200);
    const commissionRateBps = GraphBN.fromI32(100);
    const railSetup = setupCompleteRail(GraphBN.fromI32(1_000), railId, commissionRateBps);

    const railEntityId = getRailEntityId(railId);
    assert.fieldEquals("Rail", railEntityId.toHex(), "state", "ZERORATE");
    assert.fieldEquals("Rail", railEntityId.toHex(), "payer", TEST_ADDRESSES.ACCOUNT.toHex());
    assert.fieldEquals("Rail", railEntityId.toHex(), "payee", TEST_ADDRESSES.PAYEE.toHex());
    assert.fieldEquals("Rail", railEntityId.toHex(), "arbiter", railSetup.validator.toHex());
    assert.fieldEquals("Rail", railEntityId.toHex(), "serviceFeeRecipient", railSetup.serviceFeeRecipient.toHex());
    assert.fieldEquals("Rail", railEntityId.toHex(), "commissionRateBps", commissionRateBps.toString());
    assert.fieldEquals("Rail", railEntityId.toHex(), "totalSettledAmount", "0");
    assert.fieldEquals("Rail", railEntityId.toHex(), "totalNetPayeeAmount", "0");
    assert.fieldEquals("Rail", railEntityId.toHex(), "totalCommission", "0");
    assert.fieldEquals("Rail", railEntityId.toHex(), "totalSettlements", "0");
  });

  test("should handle rail rate modified properly", () => {
    const railId = GraphBN.fromI32(1200);
    const commissionRateBps = GraphBN.fromI32(100);
    setupCompleteRail(GraphBN.fromI32(1_000), railId, commissionRateBps);

    const newRate = GraphBN.fromI64(1_000_000_000);

    const railRateModifiedEvent = createRailRateModifiedEvent(railId, ZERO_BIG_INT, newRate);
    handleRailRateModified(railRateModifiedEvent);

    const railEntityIdStr = getRailEntityId(railId).toHex();
    assert.fieldEquals("Rail", railEntityIdStr, "state", "ACTIVE");
    assert.fieldEquals("Rail", railEntityIdStr, "paymentRate", newRate.toString());
    assert.fieldEquals("Rail", railEntityIdStr, "settledUpto", railRateModifiedEvent.block.number.toString());

    const payerTokenIdStr = getUserTokenEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN).toHexString();
    assert.fieldEquals("UserToken", payerTokenIdStr, "lockupRate", newRate.toString());

    const operatorApprovalIdStr = getOperatorApprovalEntityId(
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
    ).toHexString();
    const operatorTokenIdStr = getOperatorTokenEntityId(TEST_ADDRESSES.OPERATOR, TEST_ADDRESSES.TOKEN).toHexString();
    assert.fieldEquals("OperatorApproval", operatorApprovalIdStr, "rateUsage", newRate.toString());
    assert.fieldEquals("OperatorToken", operatorTokenIdStr, "rateUsage", newRate.toString());
    const rail = Rail.load(getRailEntityId(railId));
    assert.assertNotNull(rail);
    const rateChangeQueue = rail!.rateChangeQueue.load();
    assert.equals(ethereum.Value.fromI32(0), ethereum.Value.fromI32(rateChangeQueue.length));

    const newRate2 = GraphBN.fromI64(2_000_000_000);
    const railRateModifiedEvent2 = createRailRateModifiedEvent(railId, newRate, newRate2);
    railRateModifiedEvent2.block.number = railRateModifiedEvent.block.number.plus(ONE_BIG_INT);
    handleRailRateModified(railRateModifiedEvent2);

    assert.fieldEquals("Rail", railEntityIdStr, "state", "ACTIVE");
    assert.fieldEquals("Rail", railEntityIdStr, "paymentRate", newRate2.toString());
    assert.fieldEquals("Rail", railEntityIdStr, "settledUpto", railRateModifiedEvent.block.number.toString());

    assert.fieldEquals("UserToken", payerTokenIdStr, "lockupRate", newRate2.toString());
    assert.fieldEquals("OperatorApproval", operatorApprovalIdStr, "rateUsage", newRate2.toString());
    assert.fieldEquals("OperatorToken", operatorTokenIdStr, "rateUsage", newRate2.toString());
    const railAgain = Rail.load(getRailEntityId(railId));
    assert.assertNotNull(railAgain);
    const rateChangeQueueAgain = railAgain!.rateChangeQueue.load();
    assert.equals(ethereum.Value.fromI32(1), ethereum.Value.fromI32(rateChangeQueueAgain.length));
  });

  test("should handle rail lockup modified properly", () => {
    const railId = GraphBN.fromI32(1200);
    const commissionRateBps = GraphBN.fromI32(100);
    setupCompleteRail(GraphBN.fromI32(1_000), railId, commissionRateBps);

    const lockupPeriod = GraphBN.fromI32(2880);
    const lockupFixed = GraphBN.fromI32(1_000_000_000);

    const railLockupModifiedEvent = createRailLockupModifiedEvent(
      railId,
      ZERO_BIG_INT,
      lockupPeriod,
      ZERO_BIG_INT,
      lockupFixed,
    );
    handleRailLockupModified(railLockupModifiedEvent);

    const railEntityIdStr = getRailEntityId(railId).toHex();
    assert.fieldEquals("Rail", railEntityIdStr, "lockupPeriod", lockupPeriod.toString());
    assert.fieldEquals("Rail", railEntityIdStr, "lockupFixed", lockupFixed.toString());

    const operatorTokenEntityIdStr = getOperatorTokenEntityId(TEST_ADDRESSES.OPERATOR, TEST_ADDRESSES.TOKEN).toHex();
    assert.fieldEquals("OperatorToken", operatorTokenEntityIdStr, "lockupUsage", lockupFixed.toString());

    const operatorApprovalEntityIdStr = getOperatorApprovalEntityId(
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
    ).toHex();
    assert.fieldEquals("OperatorApproval", operatorApprovalEntityIdStr, "lockupUsage", lockupFixed.toString());

    const newLockupPeriod = GraphBN.fromI32(5740);
    const newLockupFixed = GraphBN.fromI32(1_000_000);

    const railLockupModifiedEvent2 = createRailLockupModifiedEvent(
      railId,
      lockupPeriod,
      newLockupPeriod,
      lockupFixed,
      newLockupFixed,
    );
    handleRailLockupModified(railLockupModifiedEvent2);

    assert.fieldEquals("Rail", railEntityIdStr, "lockupPeriod", newLockupPeriod.toString());
    assert.fieldEquals("Rail", railEntityIdStr, "lockupFixed", newLockupFixed.toString());

    assert.fieldEquals("OperatorToken", operatorTokenEntityIdStr, "lockupUsage", newLockupFixed.toString());

    assert.fieldEquals("OperatorApproval", operatorApprovalEntityIdStr, "lockupUsage", newLockupFixed.toString());
  });

  test("should handle one time payment properly", () => {
    const NETWORK_FEE_NUMERATOR = GraphBN.fromI64(1);
    const NETWORK_FEE_DENOMINATOR = GraphBN.fromI64(200);
    const COMMISSION_MAX_BPS = GraphBN.fromI64(10_000);

    const depositAmount = TEST_AMOUNTS.SMALL_DEPOSIT;
    const rateAllowance = GraphBN.fromI64(1_000_000);
    const lockupAllowance = GraphBN.fromI64(1_000_000_000_000_000);
    const maxLockupPeriod = TEST_ALLOWANCES.MAX_LOCKUP_PERIOD;

    setupDeposit(depositAmount);
    setupOperatorApproval(rateAllowance, lockupAllowance, maxLockupPeriod);

    const operatorApprovalEntityIdStr = getOperatorApprovalEntityId(
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
    ).toHex();

    assert.fieldEquals("OperatorApproval", operatorApprovalEntityIdStr, "isApproved", "true");
    assert.fieldEquals("OperatorApproval", operatorApprovalEntityIdStr, "rateAllowance", rateAllowance.toString());
    assert.fieldEquals("OperatorApproval", operatorApprovalEntityIdStr, "lockupAllowance", lockupAllowance.toString());
    assert.fieldEquals("OperatorApproval", operatorApprovalEntityIdStr, "maxLockupPeriod", maxLockupPeriod.toString());

    const railId = GraphBN.fromI64(100);
    const commissionRateBps = GraphBN.fromI32(100);
    const railSetup = setupRail(railId, commissionRateBps);

    const lockupPeriod = GraphBN.fromI64(2880);
    const lockupFixed = GraphBN.fromI64(1_000_000_000_000); // 10^12 = 0.000001 fil

    const railLockupModifiedEvent = createRailLockupModifiedEvent(
      railId,
      ZERO_BIG_INT,
      lockupPeriod,
      ZERO_BIG_INT,
      lockupFixed,
    );
    handleRailLockupModified(railLockupModifiedEvent);

    const railEntityIdStr = getRailEntityId(railId).toHex();
    const operatorTokenEntityIdStr = getOperatorTokenEntityId(TEST_ADDRESSES.OPERATOR, TEST_ADDRESSES.TOKEN).toHex();
    assert.fieldEquals("Rail", railEntityIdStr, "lockupPeriod", lockupPeriod.toString());
    assert.fieldEquals("Rail", railEntityIdStr, "lockupFixed", lockupFixed.toString());
    assert.fieldEquals("OperatorToken", operatorTokenEntityIdStr, "lockupUsage", lockupFixed.toString());
    assert.fieldEquals("OperatorApproval", operatorApprovalEntityIdStr, "lockupUsage", lockupFixed.toString());

    const totalAmount = GraphBN.fromI64(1_000_000_000_000); // 10^12 = 0.000001 fil
    const networkFee = totalAmount
      .times(NETWORK_FEE_NUMERATOR)
      .plus(NETWORK_FEE_DENOMINATOR.minus(ONE_BIG_INT))
      .div(NETWORK_FEE_DENOMINATOR);
    const operatorCommission = totalAmount.times(commissionRateBps).div(COMMISSION_MAX_BPS);
    const netPayeeAmount = totalAmount.minus(networkFee).minus(operatorCommission);

    const railOneTimePaymentProcessedEvent = createRailOneTimePaymentProcessedEvent(
      railId,
      netPayeeAmount,
      operatorCommission,
      networkFee,
    );
    handleRailOneTimePaymentProcessed(railOneTimePaymentProcessedEvent);

    const tokenIdStr = TEST_ADDRESSES.TOKEN.toHexString();
    const expectedTokenUserFunds = depositAmount.minus(networkFee);
    assert.fieldEquals("Token", tokenIdStr, "userFunds", expectedTokenUserFunds.toString());

    const operatorTokenIdStr = getOperatorTokenEntityId(TEST_ADDRESSES.OPERATOR, TEST_ADDRESSES.TOKEN).toHexString();
    assert.fieldEquals("OperatorToken", operatorTokenIdStr, "volume", totalAmount.toString());

    assert.fieldEquals("Rail", railEntityIdStr, "lockupFixed", lockupFixed.minus(netPayeeAmount).toString());
    assert.fieldEquals("Rail", railEntityIdStr, "totalNetPayeeAmount", netPayeeAmount.toString());
    assert.fieldEquals("Rail", railEntityIdStr, "totalCommission", operatorCommission.toString());

    assert.fieldEquals(
      "OperatorApproval",
      operatorApprovalEntityIdStr,
      "lockupAllowance",
      lockupAllowance.minus(totalAmount).toString(),
    );

    const payerTokenEntityIdStr = getUserTokenEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN).toHex();
    const remainingPayerFunds = depositAmount.minus(totalAmount);
    assert.fieldEquals("UserToken", payerTokenEntityIdStr, "funds", remainingPayerFunds.toString());

    const payeeTokenEntityIdStr = getUserTokenEntityId(TEST_ADDRESSES.PAYEE, TEST_ADDRESSES.TOKEN).toHex();
    assert.fieldEquals("UserToken", payeeTokenEntityIdStr, "funds", netPayeeAmount.toString());

    const serviceFeeRecipientUserTokenEntityIdStr = getUserTokenEntityId(
      railSetup.serviceFeeRecipient,
      TEST_ADDRESSES.TOKEN,
    ).toHex();
    assert.fieldEquals("UserToken", serviceFeeRecipientUserTokenEntityIdStr, "funds", operatorCommission.toString());
  });

  test("should handle rail settled properly", () => {
    const depositAmount = TEST_AMOUNTS.LARGE_DEPOSIT;
    const railId = GraphBN.fromI64(200);
    const commissionRateBps = GraphBN.fromI32(500); // 5%

    setupCompleteRail(depositAmount, railId, commissionRateBps);

    const paymentRate = TEST_AMOUNTS.PAYMENT_RATE_MEDIUM;
    const railRateModifiedEvent = createRailRateModifiedEvent(railId, ZERO_BIG_INT, paymentRate);
    handleRailRateModified(railRateModifiedEvent);

    const totalSettledAmount = GraphBN.fromI64(1_000_000_000_000_000); // 0.001 FIL
    const networkFee = GraphBN.fromI64(5_000_000_000_000); // 0.000005 FIL
    const operatorCommission = totalSettledAmount.times(commissionRateBps).div(GraphBN.fromI64(10_000));
    const totalNetPayeeAmount = totalSettledAmount.minus(networkFee).minus(operatorCommission);
    const settledUpto = railRateModifiedEvent.block.number.plus(GraphBN.fromI64(10000));

    const railSettledEvent = createRailSettledEvent(
      railId,
      totalSettledAmount,
      totalNetPayeeAmount,
      operatorCommission,
      networkFee,
      settledUpto,
    );
    handleRailSettled(railSettledEvent);

    const railEntityId = getRailEntityId(railId).toHex();
    assert.fieldEquals("Rail", railEntityId, "totalSettledAmount", totalSettledAmount.toString());
    assert.fieldEquals("Rail", railEntityId, "totalNetPayeeAmount", totalNetPayeeAmount.toString());
    assert.fieldEquals("Rail", railEntityId, "totalCommission", operatorCommission.toString());
    assert.fieldEquals("Rail", railEntityId, "totalSettlements", "1");
    assert.fieldEquals("Rail", railEntityId, "settledUpto", settledUpto.toString());

    const settlementIdStr = getSettlementEntityId(railSettledEvent.transaction.hash, railSettledEvent.logIndex).toHex();
    assert.fieldEquals("Settlement", settlementIdStr, "totalSettledAmount", totalSettledAmount.toString());
    assert.fieldEquals("Settlement", settlementIdStr, "totalNetPayeeAmount", totalNetPayeeAmount.toString());
    assert.fieldEquals("Settlement", settlementIdStr, "operatorCommission", operatorCommission.toString());
    assert.fieldEquals("Settlement", settlementIdStr, "filBurned", networkFee.toString());
    assert.fieldEquals("Settlement", settlementIdStr, "settledUpto", settledUpto.toString());

    const expectedPayerFunds = depositAmount.minus(totalSettledAmount);
    assertUserTokenFunds(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN, expectedPayerFunds);
    const payerTokenIdStr = getUserTokenEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN).toHexString();
    assert.fieldEquals("UserToken", payerTokenIdStr, "payout", totalSettledAmount.toString());

    assertUserTokenFunds(TEST_ADDRESSES.PAYEE, TEST_ADDRESSES.TOKEN, totalNetPayeeAmount);
    const payeeTokenIdStr = getUserTokenEntityId(TEST_ADDRESSES.PAYEE, TEST_ADDRESSES.TOKEN).toHexString();
    assert.fieldEquals("UserToken", payeeTokenIdStr, "fundsCollected", totalNetPayeeAmount.toString());

    const expectedTokenUserFunds = depositAmount.minus(operatorCommission);
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHex(), "userFunds", expectedTokenUserFunds.toString());
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHex(), "totalSettledAmount", totalSettledAmount.toString());

    const operatorTokenId = getOperatorTokenEntityId(TEST_ADDRESSES.OPERATOR, TEST_ADDRESSES.TOKEN).toHexString();
    assert.fieldEquals("OperatorToken", operatorTokenId, "settledAmount", totalSettledAmount.toString());
    assert.fieldEquals("OperatorToken", operatorTokenId, "commissionEarned", operatorCommission.toString());
    assert.fieldEquals("OperatorToken", operatorTokenId, "volume", totalSettledAmount.toString());
  });

  test("should handle rail terminated properly", () => {
    const depositAmount = TEST_AMOUNTS.MEDIUM_DEPOSIT;
    const railId = GraphBN.fromI64(300);
    const commissionRateBps = GraphBN.fromI32(250); // 2.5%

    setupCompleteRail(depositAmount, railId, commissionRateBps);

    const paymentRate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const railRateModifiedEvent = createRailRateModifiedEvent(railId, ZERO_BIG_INT, paymentRate);
    handleRailRateModified(railRateModifiedEvent);

    assertRailState(railId, "ACTIVE");
    const railEntityId = getRailEntityId(railId).toHex();
    assert.fieldEquals("Rail", railEntityId, "paymentRate", paymentRate.toString());

    const payerTokenIdStr = getUserTokenEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN).toHexString();
    const initialLockupRate = paymentRate;
    assert.fieldEquals("UserToken", payerTokenIdStr, "lockupRate", initialLockupRate.toString());

    const endEpoch = railRateModifiedEvent.block.number.plus(GraphBN.fromI64(5000));
    const railTerminatedEvent = createRailTerminatedEvent(railId, TEST_ADDRESSES.ACCOUNT, endEpoch);
    railTerminatedEvent.block.number = railRateModifiedEvent.block.number.plus(GraphBN.fromI64(100));
    handleRailTerminated(railTerminatedEvent);

    assertRailState(railId, "TERMINATED");
    assert.fieldEquals("Rail", railEntityId, "endEpoch", endEpoch.toString());

    const expectedLockupRate = ZERO_BIG_INT;
    assert.fieldEquals("UserToken", payerTokenIdStr, "lockupRate", expectedLockupRate.toString());
  });

  test("should handle rail finalized properly", () => {
    const depositAmount = TEST_AMOUNTS.XLARGE_DEPOSIT;
    const railId = GraphBN.fromI64(400);
    const commissionRateBps = GraphBN.fromI32(300); // 3%

    setupCompleteRail(depositAmount, railId, commissionRateBps);

    const paymentRate = TEST_AMOUNTS.PAYMENT_RATE_HIGH;
    const railRateModifiedEvent = createRailRateModifiedEvent(railId, ZERO_BIG_INT, paymentRate);
    handleRailRateModified(railRateModifiedEvent);

    const lockupPeriod = GraphBN.fromI64(1000);
    const lockupFixed = TEST_AMOUNTS.LOCKUP_FIXED_SMALL;
    const railLockupModifiedEvent = createRailLockupModifiedEvent(
      railId,
      ZERO_BIG_INT,
      lockupPeriod,
      ZERO_BIG_INT,
      lockupFixed,
    );
    handleRailLockupModified(railLockupModifiedEvent);

    assertRailState(railId, "ACTIVE");
    const railEntityId = getRailEntityId(railId).toHex();
    assert.fieldEquals("Rail", railEntityId, "paymentRate", paymentRate.toString());
    assert.fieldEquals("Rail", railEntityId, "lockupFixed", lockupFixed.toString());
    assert.fieldEquals("Rail", railEntityId, "lockupPeriod", lockupPeriod.toString());

    const operatorApprovalId = getOperatorApprovalEntityId(
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
    ).toHex();
    const operatorTokenId = getOperatorTokenEntityId(TEST_ADDRESSES.OPERATOR, TEST_ADDRESSES.TOKEN).toHex();
    const expectedLockupUsage = lockupFixed.plus(paymentRate.times(lockupPeriod));
    assert.fieldEquals("OperatorApproval", operatorApprovalId, "lockupUsage", expectedLockupUsage.toString());
    assert.fieldEquals("OperatorToken", operatorTokenId, "lockupUsage", expectedLockupUsage.toString());

    const railFinalizedEvent = createRailFinalizedEvent(railId);
    railFinalizedEvent.block.number = railRateModifiedEvent.block.number.plus(GraphBN.fromI64(200));
    handleRailFinalized(railFinalizedEvent);

    assertRailState(railId, "FINALIZED");
    assertOperatorLockupCleared(TEST_ADDRESSES.OPERATOR, TEST_ADDRESSES.TOKEN);
  });
});
