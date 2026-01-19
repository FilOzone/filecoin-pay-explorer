/* eslint-disable no-underscore-dangle, @typescript-eslint/no-unnecessary-type-assertion */
import { ethereum, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { afterEach, assert, beforeAll, clearStore, describe, test } from "matchstick-as";

import { Rail } from "../../generated/schema";
import {
  handleAccountLockupSettled,
  handleDepositRecorded,
  handleOperatorApprovalUpdated,
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
  assertAccountState,
  assertOperatorApprovalState,
  assertOperatorLockupCleared,
  assertOperatorState,
  assertOperatorTokenState,
  assertRailLockupParams,
  assertRailParams,
  assertRailRateParams,
  assertTokenState,
  assertUserTokenState,
  calculateNetworkFee,
  calculateOperatorCommission,
  setupCompleteRail,
  setupDeposit,
  setupOperatorApproval,
  setupRail,
  TEST_ADDRESSES,
  TEST_ALLOWANCES,
  TEST_AMOUNTS,
} from "./fixtures";

// exporting all handlers used to run the test coverage
export {
  handleAccountLockupSettled,
  handleDepositRecorded,
  handleOperatorApprovalUpdated,
  handleRailFinalized,
  handleRailLockupModified,
  handleRailOneTimePaymentProcessed,
  handleRailRateModified,
  handleRailSettled,
  handleRailTerminated,
  handleWithdrawRecorded,
};

describe("Payments", () => {
  const tokenName = "Test Token";
  const tokenSymbol = "TEST";
  const tokenDecimals = 18;

  beforeAll(() => {
    mockERC20Contract(TEST_ADDRESSES.TOKEN, tokenName, tokenSymbol, tokenDecimals);
  });

  afterEach(() => {
    clearStore();
  });

  test("should handle deposit recorded properly", () => {
    // Act: Record a deposit
    const depositAmount = GraphBN.fromI32(1000);
    setupDeposit(depositAmount);

    // Assert: Token entity created with deposit tracked
    assertTokenState(
      TEST_ADDRESSES.TOKEN,
      tokenName,
      tokenSymbol,
      tokenDecimals.toString(),
      depositAmount, // userFunds
      depositAmount, // totalDeposits
      depositAmount, // volume
      "1", // totalUsers
      "0", // totalWithdrawals
    );

    // Assert: Account state ( address & totalTokens )
    assertAccountState(TEST_ADDRESSES.ACCOUNT, "1");

    // Assert: UserToken state ( funds, payout, fundsCollected )
    assertUserTokenState(
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.TOKEN,
      depositAmount,
      "0", // payout
      "0", // fundsCollected
    );
  });

  test("should handle withdraw recorded properly", () => {
    // Arrange: Setup initial deposit
    const depositAmount = GraphBN.fromI32(1000);
    const withdrawAmount = GraphBN.fromI32(500);
    const depositEvent = createDepositRecordedEvent(
      TEST_ADDRESSES.TOKEN,
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.ACCOUNT,
      depositAmount,
    );
    handleDepositRecorded(depositEvent);

    // Act: Record a withdrawal
    const withdrawEvent = createWithdrawRecordedEvent(
      TEST_ADDRESSES.TOKEN,
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.ACCOUNT,
      withdrawAmount,
    );
    handleWithdrawRecorded(withdrawEvent);

    // Assert: UserToken funds reduced by withdrawal amount
    const userTokenIdStr = getUserTokenEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN).toHexString();
    const expectedFunds = depositAmount.minus(withdrawAmount);
    assert.fieldEquals("UserToken", userTokenIdStr, "funds", expectedFunds.toString());

    // Assert: Token-level accounting updated
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "userFunds", expectedFunds.toString());
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "totalWithdrawals", withdrawAmount.toString());

    // Assert: Volume includes both deposit and withdrawal
    const expectedVolume = depositAmount.plus(withdrawAmount);
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "volume", expectedVolume.toString());
  });

  test("should handle operator approval updated properly", () => {
    // Act: Create operator approval with allowances
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

    // Assert: Operator state ( address, totalApprovals, totalTokens )
    assertOperatorState(TEST_ADDRESSES.OPERATOR, "1", "1");

    // Assert: OperatorToken state ( lockupUsage, rateUsage )
    assertOperatorTokenState(
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
      "0", // lockupUsage
      "0", // rateUsage
    );

    // Assert: OperatorApproval entity created with allowances
    assertOperatorApprovalState(
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
      "true",
      rateAllowance,
      lockupAllowance,
      maxLockupPeriod,
      "0", // lockupUsage
      "0", // rateUsage
    );
  });

  test("should handle account lockup settled properly", () => {
    // Arrange: Setup deposit to create UserToken entity
    const depositAmount = GraphBN.fromI32(1000);
    setupDeposit(depositAmount);

    // Act: Settle account lockup
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

    // Assert: UserToken lockup fields updated
    const userTokenIdStr = getUserTokenEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN).toHexString();
    assert.fieldEquals("UserToken", userTokenIdStr, "lockupCurrent", lockupCurrent.toString());
    assert.fieldEquals("UserToken", userTokenIdStr, "lockupRate", lockupRate.toString());
    assert.fieldEquals("UserToken", userTokenIdStr, "lockupLastSettledUntilEpoch", lockupLastSettledAt.toString());
  });

  test("should handle rail created properly", () => {
    // Act: Create a rail (includes deposit and operator approval)
    const railId = GraphBN.fromI32(1200);
    const commissionRateBps = GraphBN.fromI32(100); // 1%
    const railSetup = setupCompleteRail(GraphBN.fromI32(1_000), railId, commissionRateBps);

    // Assert: Rail created in ZERORATE state with zero totals
    assertRailParams(
      railId,
      "ZERORATE",
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.PAYEE,
      railSetup.validator,
      railSetup.serviceFeeRecipient,
      commissionRateBps,
      "0", // totalSettledAmount
      "0", // totalNetPayeeAmount
      "0", // totalCommission
      "0", // totalSettlements
    );
  });

  test("should handle rail rate modified properly", () => {
    const railId = GraphBN.fromI32(1200);
    const commissionRateBps = GraphBN.fromI32(100);
    // setupCompleteRail creates a rail with:
    // - paymentRate = 0
    // - settledUpto = block.number
    // - state = ZERORATE
    setupCompleteRail(GraphBN.fromI32(1_000), railId, commissionRateBps);

    const payerTokenIdStr = getUserTokenEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN).toHexString();

    // ACT 1: Modify rate from 0 -> newRate (triggers ZERORATE -> ACTIVE)
    const newRate = GraphBN.fromI64(1_000_000_000);
    const railRateModifiedEvent = createRailRateModifiedEvent(railId, ZERO_BIG_INT, newRate);
    handleRailRateModified(railRateModifiedEvent);

    // ASSERT 1: Verify state after first rate modification
    // Rail should transition: ZERORATE -> ACTIVE
    // settledUpto updates to event block number (previous rate was zero, no settlement needed)
    assertRailRateParams(railId, "ACTIVE", newRate, railRateModifiedEvent.block.number.toString());

    assert.fieldEquals("UserToken", payerTokenIdStr, "lockupRate", newRate.toString());

    assertOperatorApprovalState(
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
      "true",
      TEST_ALLOWANCES.RATE,
      TEST_ALLOWANCES.LOCKUP,
      TEST_ALLOWANCES.MAX_LOCKUP_PERIOD,
      "0", // lockupUsage unchanged
      newRate.toString(), // rateUsage updated to newRate
    );

    assertOperatorTokenState(
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
      "0", // lockupUsage unchanged
      newRate.toString(), // rateUsage updated to newRate
    );

    // Rate change queue should be empty (0 -> newRate doesn't require settlement tracking)
    const rail = Rail.load(getRailEntityId(railId));
    assert.assertNotNull(rail);
    const rateChangeQueue = rail!.rateChangeQueue.load();
    assert.equals(ethereum.Value.fromI32(0), ethereum.Value.fromI32(rateChangeQueue.length));

    // ACT 2: Modify rate from newRate -> newRate2 (ACTIVE -> ACTIVE)
    const newRate2 = GraphBN.fromI64(2_000_000_000);
    const railRateModifiedEvent2 = createRailRateModifiedEvent(railId, newRate, newRate2);
    railRateModifiedEvent2.block.number = railRateModifiedEvent.block.number.plus(ONE_BIG_INT);
    handleRailRateModified(railRateModifiedEvent2);

    // ASSERT 2: Verify state after second rate modification
    // Rail remains ACTIVE, settledUpto unchanged (no settlement occurred between events)
    assertRailRateParams(railId, "ACTIVE", newRate2, railRateModifiedEvent.block.number.toString());

    assert.fieldEquals("UserToken", payerTokenIdStr, "lockupRate", newRate2.toString());

    assertOperatorApprovalState(
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
      "true",
      TEST_ALLOWANCES.RATE,
      TEST_ALLOWANCES.LOCKUP,
      TEST_ALLOWANCES.MAX_LOCKUP_PERIOD,
      "0", // lockupUsage unchanged
      newRate2.toString(), // rateUsage updated to newRate2
    );

    assertOperatorTokenState(
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
      "0", // lockupUsage unchanged
      newRate2.toString(), // rateUsage updated to newRate2
    );

    // Rate change queue should have 1 entry (non-zero -> non-zero requires settlement tracking)
    const railAgain = Rail.load(getRailEntityId(railId));
    assert.assertNotNull(railAgain);
    const rateChangeQueueAgain = railAgain!.rateChangeQueue.load();
    assert.equals(ethereum.Value.fromI32(1), ethereum.Value.fromI32(rateChangeQueueAgain.length));
  });

  test("should handle rail lockup modified properly", () => {
    // Arrange: Create a rail with zero lockup params
    const railId = GraphBN.fromI32(1200);
    const commissionRateBps = GraphBN.fromI32(100);
    setupCompleteRail(GraphBN.fromI32(1_000), railId, commissionRateBps);

    // Pre-compute entity IDs for assertions
    const operatorTokenEntityIdStr = getOperatorTokenEntityId(TEST_ADDRESSES.OPERATOR, TEST_ADDRESSES.TOKEN).toHex();
    const operatorApprovalEntityIdStr = getOperatorApprovalEntityId(
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
    ).toHex();

    // Act 1: Modify lockup from zero (0 -> lockupPeriod, 0 -> lockupFixed)
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

    // Assert 1: Verify lockup params and usage updated
    assertRailLockupParams(railId, lockupPeriod, lockupFixed);
    assert.fieldEquals("OperatorToken", operatorTokenEntityIdStr, "lockupUsage", lockupFixed.toString());
    assert.fieldEquals("OperatorApproval", operatorApprovalEntityIdStr, "lockupUsage", lockupFixed.toString());

    // Act 2: Modify lockup to new values (lockupPeriod -> newLockupPeriod, lockupFixed -> newLockupFixed)
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

    // Assert 2: Verify lockup params and usage updated to new values
    assertRailLockupParams(railId, newLockupPeriod, newLockupFixed);
    assert.fieldEquals("OperatorToken", operatorTokenEntityIdStr, "lockupUsage", newLockupFixed.toString());
    assert.fieldEquals("OperatorApproval", operatorApprovalEntityIdStr, "lockupUsage", newLockupFixed.toString());
  });

  test("should handle one time payment properly", () => {
    // Arrange: Setup payer deposit and operator approval
    const depositAmount = TEST_AMOUNTS.SMALL_DEPOSIT;
    const rateAllowance = GraphBN.fromI64(1_000_000);
    const lockupAllowance = GraphBN.fromI64(1_000_000_000_000_000);
    const maxLockupPeriod = TEST_ALLOWANCES.MAX_LOCKUP_PERIOD;
    setupDeposit(depositAmount);
    setupOperatorApproval(rateAllowance, lockupAllowance, maxLockupPeriod);

    // Create rail with lockup (one-time payments use lockupFixed, not payment rate)
    const railId = GraphBN.fromI64(100);
    const commissionRateBps = GraphBN.fromI32(100); // 1%
    const railSetup = setupRail(railId, commissionRateBps);

    const lockupPeriod = GraphBN.fromI64(2880);
    const lockupFixed = GraphBN.fromI64(1_000_000_000_000); // 10^12 = 0.000001 FIL
    const railLockupModifiedEvent = createRailLockupModifiedEvent(
      railId,
      ZERO_BIG_INT,
      lockupPeriod,
      ZERO_BIG_INT,
      lockupFixed,
    );
    handleRailLockupModified(railLockupModifiedEvent);

    // Pre-compute entity IDs for assertions
    const railEntityIdStr = getRailEntityId(railId).toHex();
    const operatorTokenEntityIdStr = getOperatorTokenEntityId(TEST_ADDRESSES.OPERATOR, TEST_ADDRESSES.TOKEN).toHex();
    const operatorApprovalEntityIdStr = getOperatorApprovalEntityId(
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
    ).toHex();
    const payerTokenEntityIdStr = getUserTokenEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN).toHex();
    const payeeTokenEntityIdStr = getUserTokenEntityId(TEST_ADDRESSES.PAYEE, TEST_ADDRESSES.TOKEN).toHex();
    const serviceFeeRecipientTokenIdStr = getUserTokenEntityId(
      railSetup.serviceFeeRecipient,
      TEST_ADDRESSES.TOKEN,
    ).toHex();

    // Verify: Lockup is set correctly before payment
    assert.fieldEquals("Rail", railEntityIdStr, "lockupPeriod", lockupPeriod.toString());
    assert.fieldEquals("Rail", railEntityIdStr, "lockupFixed", lockupFixed.toString());
    assert.fieldEquals("OperatorToken", operatorTokenEntityIdStr, "lockupUsage", lockupFixed.toString());
    assert.fieldEquals("OperatorApproval", operatorApprovalEntityIdStr, "lockupUsage", lockupFixed.toString());

    // Act: Process one-time payment
    // Payment breakdown: totalAmount = netPayeeAmount + operatorCommission + networkFee
    const totalAmount = GraphBN.fromI64(1_000_000_000_000); // 10^12 = 0.000001 FIL
    const networkFee = calculateNetworkFee(totalAmount);
    const operatorCommission = calculateOperatorCommission(totalAmount, commissionRateBps);
    const netPayeeAmount = totalAmount.minus(networkFee).minus(operatorCommission);

    const railOneTimePaymentProcessedEvent = createRailOneTimePaymentProcessedEvent(
      railId,
      netPayeeAmount,
      operatorCommission,
      networkFee,
    );
    handleRailOneTimePaymentProcessed(railOneTimePaymentProcessedEvent);

    // Assert: Token-level state (network fee burned)
    const expectedTokenUserFunds = depositAmount.minus(networkFee);
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHexString(), "userFunds", expectedTokenUserFunds.toString());

    // Assert: Rail state updated (lockupFixed reduced, payment tracked)
    assert.fieldEquals("Rail", railEntityIdStr, "lockupFixed", lockupFixed.minus(netPayeeAmount).toString());
    assert.fieldEquals("Rail", railEntityIdStr, "totalNetPayeeAmount", netPayeeAmount.toString());
    assert.fieldEquals("Rail", railEntityIdStr, "totalCommission", operatorCommission.toString());

    // Assert: Operator usage updated
    assert.fieldEquals("OperatorToken", operatorTokenEntityIdStr, "volume", totalAmount.toString());
    assert.fieldEquals(
      "OperatorApproval",
      operatorApprovalEntityIdStr,
      "lockupAllowance",
      lockupAllowance.minus(totalAmount).toString(),
    );

    // Assert: Fund transfers - payer debited, payee and serviceFeeRecipient credited
    const remainingPayerFunds = depositAmount.minus(totalAmount);
    assert.fieldEquals("UserToken", payerTokenEntityIdStr, "funds", remainingPayerFunds.toString());
    assert.fieldEquals("UserToken", payeeTokenEntityIdStr, "funds", netPayeeAmount.toString());
    assert.fieldEquals("UserToken", serviceFeeRecipientTokenIdStr, "funds", operatorCommission.toString());
  });

  test("should handle rail settled properly", () => {
    // Arrange: Create an active rail with a payment rate
    const depositAmount = TEST_AMOUNTS.LARGE_DEPOSIT;
    const railId = GraphBN.fromI64(200);
    const commissionRateBps = GraphBN.fromI32(500); // 5%
    setupCompleteRail(depositAmount, railId, commissionRateBps);

    // Activate rail by setting payment rate (0 -> paymentRate)
    const paymentRate = TEST_AMOUNTS.PAYMENT_RATE_MEDIUM;
    const railRateModifiedEvent = createRailRateModifiedEvent(railId, ZERO_BIG_INT, paymentRate);
    handleRailRateModified(railRateModifiedEvent);

    // Pre-compute entity IDs for assertions
    const railEntityId = getRailEntityId(railId).toHex();
    const payerTokenIdStr = getUserTokenEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN).toHexString();
    const payeeTokenIdStr = getUserTokenEntityId(TEST_ADDRESSES.PAYEE, TEST_ADDRESSES.TOKEN).toHexString();
    const operatorTokenIdStr = getOperatorTokenEntityId(TEST_ADDRESSES.OPERATOR, TEST_ADDRESSES.TOKEN).toHexString();

    // Act: Settle the rail
    // Settlement breakdown: totalSettledAmount = totalNetPayeeAmount + operatorCommission + networkFee
    const totalSettledAmount = TEST_AMOUNTS.SMALL_DEPOSIT; // 0.001 FIL
    const networkFee = calculateNetworkFee(totalSettledAmount);
    const operatorCommission = calculateOperatorCommission(totalSettledAmount, commissionRateBps);
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

    // Assert: Rail state updated with settlement totals
    assert.fieldEquals("Rail", railEntityId, "settledUpto", settledUpto.toString());
    assert.fieldEquals("Rail", railEntityId, "totalSettledAmount", totalSettledAmount.toString());
    assert.fieldEquals("Rail", railEntityId, "totalNetPayeeAmount", totalNetPayeeAmount.toString());
    assert.fieldEquals("Rail", railEntityId, "totalCommission", operatorCommission.toString());
    assert.fieldEquals("Rail", railEntityId, "totalSettlements", "1");

    // Assert: Settlement entity created with correct values
    const settlementIdStr = getSettlementEntityId(railSettledEvent.transaction.hash, railSettledEvent.logIndex).toHex();
    assert.fieldEquals("Settlement", settlementIdStr, "totalSettledAmount", totalSettledAmount.toString());
    assert.fieldEquals("Settlement", settlementIdStr, "totalNetPayeeAmount", totalNetPayeeAmount.toString());
    assert.fieldEquals("Settlement", settlementIdStr, "operatorCommission", operatorCommission.toString());
    assert.fieldEquals("Settlement", settlementIdStr, "filBurned", networkFee.toString());
    assert.fieldEquals("Settlement", settlementIdStr, "settledUpto", settledUpto.toString());

    // Assert: Payer funds debited
    const expectedPayerFunds = depositAmount.minus(totalSettledAmount);
    assert.fieldEquals("UserToken", payerTokenIdStr, "funds", expectedPayerFunds.toString());
    assert.fieldEquals("UserToken", payerTokenIdStr, "payout", totalSettledAmount.toString());

    // Assert: Payee funds credited
    assert.fieldEquals("UserToken", payeeTokenIdStr, "funds", totalNetPayeeAmount.toString());
    assert.fieldEquals("UserToken", payeeTokenIdStr, "fundsCollected", totalNetPayeeAmount.toString());

    // Assert: Token-level accounting (network fee burned from userFunds)
    const expectedTokenFunds = depositAmount.minus(operatorCommission);
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHex(), "userFunds", expectedTokenFunds.toString());
    assert.fieldEquals("Token", TEST_ADDRESSES.TOKEN.toHex(), "totalSettledAmount", totalSettledAmount.toString());

    // Assert: Operator earnings tracked
    assert.fieldEquals("OperatorToken", operatorTokenIdStr, "settledAmount", totalSettledAmount.toString());
    assert.fieldEquals("OperatorToken", operatorTokenIdStr, "commissionEarned", operatorCommission.toString());
    assert.fieldEquals("OperatorToken", operatorTokenIdStr, "volume", totalSettledAmount.toString());
  });

  test("should handle rail terminated properly", () => {
    // Arrange: Create an rail after deposit by payer and operator approval
    const depositAmount = TEST_AMOUNTS.MEDIUM_DEPOSIT;
    const railId = GraphBN.fromI64(300);
    const commissionRateBps = GraphBN.fromI32(250); // 2.5%
    setupCompleteRail(depositAmount, railId, commissionRateBps);

    // change rail state to active by modifying rate to paymentRate from 0
    const paymentRate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const railRateModifiedEvent = createRailRateModifiedEvent(railId, ZERO_BIG_INT, paymentRate);
    handleRailRateModified(railRateModifiedEvent);

    // Act: Terminate the rail with a future endEpoch
    const endEpoch = railRateModifiedEvent.block.number.plus(GraphBN.fromI64(5000));
    const railTerminatedEvent = createRailTerminatedEvent(railId, TEST_ADDRESSES.ACCOUNT, endEpoch);
    railTerminatedEvent.block.number = railRateModifiedEvent.block.number.plus(GraphBN.fromI64(100));
    handleRailTerminated(railTerminatedEvent);

    // Assert: Rail state transitions to TERMINATED
    // endEpoch is set correctly
    const railEntityId = getRailEntityId(railId).toHex();
    assert.fieldEquals("Rail", railEntityId, "state", "TERMINATED");
    assert.fieldEquals("Rail", railEntityId, "endEpoch", endEpoch.toString());

    // Payer's lockupRate is cleared to zero
    const payerTokenIdStr = getUserTokenEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.TOKEN).toHexString();
    assert.fieldEquals("UserToken", payerTokenIdStr, "lockupRate", ZERO_BIG_INT.toString());
  });

  test("should handle rail finalized properly", () => {
    // Arrange: Create an active rail with payment rate and lockup params
    const depositAmount = TEST_AMOUNTS.XLARGE_DEPOSIT;
    const railId = GraphBN.fromI64(400);
    const commissionRateBps = GraphBN.fromI32(300); // 3%
    setupCompleteRail(depositAmount, railId, commissionRateBps);

    // Set payment rate (0 -> paymentRate)
    const paymentRate = TEST_AMOUNTS.PAYMENT_RATE_HIGH;
    const railRateModifiedEvent = createRailRateModifiedEvent(railId, ZERO_BIG_INT, paymentRate);
    handleRailRateModified(railRateModifiedEvent);

    // Set lockup params (0 -> lockupPeriod, 0 -> lockupFixed)
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

    // Verify: Rail is ACTIVE with correct rate and lockup params
    assertRailRateParams(railId, "ACTIVE", paymentRate, railRateModifiedEvent.block.number.toString());
    assertRailLockupParams(railId, lockupPeriod, lockupFixed);

    // Verify: Operator usage reflects lockupFixed + (paymentRate * lockupPeriod)
    const expectedLockupUsage = lockupFixed.plus(paymentRate.times(lockupPeriod));
    assertOperatorApprovalState(
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
      "true",
      TEST_ALLOWANCES.RATE,
      TEST_ALLOWANCES.LOCKUP,
      TEST_ALLOWANCES.MAX_LOCKUP_PERIOD,
      expectedLockupUsage.toString(), // lockupUsage
      paymentRate.toString(), // rateUsage
    );
    assertOperatorTokenState(
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
      expectedLockupUsage.toString(), // lockupUsage
      paymentRate.toString(), // rateUsage
    );

    // Act: Finalize the rail
    const railFinalizedEvent = createRailFinalizedEvent(railId);
    railFinalizedEvent.block.number = railRateModifiedEvent.block.number.plus(GraphBN.fromI64(200));
    handleRailFinalized(railFinalizedEvent);

    // Assert: Rail state transitions to FINALIZED
    const railEntityId = getRailEntityId(railId).toHex();
    assert.fieldEquals("Rail", railEntityId, "state", "FINALIZED");

    // Assert: Operator lockup usage is cleared
    assertOperatorLockupCleared(TEST_ADDRESSES.OPERATOR, TEST_ADDRESSES.TOKEN);
  });
});
