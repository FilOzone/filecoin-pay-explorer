import { BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { afterEach, assert, beforeAll, clearStore, describe, test } from "matchstick-as";
import {
  handleRailFinalized,
  handleRailLockupModified,
  handleRailRateModified,
  handleRailSettled,
  handleRailTerminated,
} from "../../src/payments";
import { ZERO_BIG_INT } from "../../src/utils/metrics";
import { mockERC20Contract } from "../mocks";
import {
  createRailFinalizedEvent,
  createRailLockupModifiedEvent,
  createRailRateModifiedEvent,
  createRailSettledEvent,
  createRailTerminatedEvent,
} from "./events";
import {
  assertTokenTotalLockup,
  calculateNetworkFee,
  setupCompleteRail,
  TEST_ADDRESSES,
  TEST_AMOUNTS,
} from "./fixtures";

describe("Token Lockup Tracking", () => {
  const tokenName = "Test Token";
  const tokenSymbol = "TEST";
  const tokenDecimals = 18;

  beforeAll(() => {
    mockERC20Contract(TEST_ADDRESSES.TOKEN, tokenName, tokenSymbol, tokenDecimals);
  });

  afterEach(() => {
    clearStore();
  });

  test("should track token lockup correctly through complete rail lifecycle", () => {
    // lockup state
    let lockupCurrent = ZERO_BIG_INT;
    let lockupRate = ZERO_BIG_INT;
    let lockupLastSettledUntilEpoch = ZERO_BIG_INT;
    // Arrange: Setup First Rail
    let blockNumber = GraphBN.fromI64(1);
    const depositAmount = TEST_AMOUNTS.MEDIUM_DEPOSIT;
    const railId1 = GraphBN.fromI64(1);
    setupCompleteRail(depositAmount, railId1, ZERO_BIG_INT);

    const lockupPeriod1 = GraphBN.fromI32(30);
    const lockupFixed1 = TEST_AMOUNTS.LOCKUP_FIXED_SMALL;
    const railLockupModifiedEvent = createRailLockupModifiedEvent(
      railId1,
      ZERO_BIG_INT,
      lockupPeriod1,
      ZERO_BIG_INT,
      lockupFixed1,
    );
    railLockupModifiedEvent.block.number = blockNumber;
    handleRailLockupModified(railLockupModifiedEvent);

    // lockup state
    lockupCurrent = lockupFixed1;
    // no update in lockupRate and lockupLastSettledUntilEpoch
    assertTokenTotalLockup(TEST_ADDRESSES.TOKEN, lockupCurrent, lockupRate, lockupLastSettledUntilEpoch);

    // update rail rate at block = 10
    blockNumber = GraphBN.fromI64(10);
    const newRate = TEST_AMOUNTS.PAYMENT_RATE_MEDIUM;
    const railRateModifiedEvent = createRailRateModifiedEvent(railId1, ZERO_BIG_INT, newRate);
    railRateModifiedEvent.block.number = blockNumber;
    handleRailRateModified(railRateModifiedEvent);

    // lockup state after RailRateModified event
    lockupCurrent = lockupCurrent.plus(newRate.times(lockupPeriod1));
    lockupRate = lockupRate.plus(newRate);
    lockupLastSettledUntilEpoch = railRateModifiedEvent.block.number;
    assertTokenTotalLockup(TEST_ADDRESSES.TOKEN, lockupCurrent, lockupRate, lockupLastSettledUntilEpoch);

    // Create Another rail
    const railId2 = GraphBN.fromI64(2);
    setupCompleteRail(depositAmount, railId2, ZERO_BIG_INT);

    // rail2: modify rail lockup at block = 30
    blockNumber = GraphBN.fromI64(30);
    const lockupPeriod2 = GraphBN.fromI32(30);
    const lockupFixed2 = TEST_AMOUNTS.LOCKUP_FIXED_MEDIUM;
    const railLockupModifiedEvent2 = createRailLockupModifiedEvent(
      railId2,
      ZERO_BIG_INT,
      lockupPeriod2,
      ZERO_BIG_INT,
      lockupFixed2,
    );
    railLockupModifiedEvent2.block.number = blockNumber;
    handleRailLockupModified(railLockupModifiedEvent2);

    // lockup state after RailLockupModified event for rail2
    lockupCurrent = lockupCurrent.plus(lockupFixed2);
    // no update in lockupRate and lockupLastSettledUntilEpoch
    assertTokenTotalLockup(TEST_ADDRESSES.TOKEN, lockupCurrent, lockupRate, lockupLastSettledUntilEpoch);

    // rail1: modify rail rate at block = 50
    blockNumber = GraphBN.fromI64(50);
    const newRate2 = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const railRateModifiedEvent2 = createRailRateModifiedEvent(railId1, newRate, newRate2);
    railRateModifiedEvent2.block.number = blockNumber;
    handleRailRateModified(railRateModifiedEvent2);

    // lockup state after RailRateModified event for rail1
    // settleTokenLockup till block 50
    lockupCurrent = lockupCurrent.plus(blockNumber.minus(lockupLastSettledUntilEpoch).times(lockupRate));
    lockupCurrent = lockupCurrent.minus(newRate.times(lockupPeriod1)).plus(newRate2.times(lockupPeriod1));
    lockupRate = lockupRate.minus(newRate).plus(newRate2);
    lockupLastSettledUntilEpoch = railRateModifiedEvent2.block.number;
    assertTokenTotalLockup(TEST_ADDRESSES.TOKEN, lockupCurrent, lockupRate, lockupLastSettledUntilEpoch);

    // rail2: modify rail rate at block = 60
    blockNumber = GraphBN.fromI64(60);
    const newRate3 = TEST_AMOUNTS.PAYMENT_RATE_HIGH;
    const railRateModifiedEvent3 = createRailRateModifiedEvent(railId2, ZERO_BIG_INT, newRate3);
    railRateModifiedEvent3.block.number = blockNumber;
    handleRailRateModified(railRateModifiedEvent3);

    // lockup state after RailRateModified event for rail2
    // settleTokenLockup till block 60
    lockupCurrent = lockupCurrent.plus(blockNumber.minus(lockupLastSettledUntilEpoch).times(lockupRate));
    lockupCurrent = lockupCurrent.plus(newRate3.times(lockupPeriod2));
    lockupRate = lockupRate.plus(newRate3);
    lockupLastSettledUntilEpoch = railRateModifiedEvent3.block.number;
    assertTokenTotalLockup(TEST_ADDRESSES.TOKEN, lockupCurrent, lockupRate, lockupLastSettledUntilEpoch);

    // rail1: modify rail rate at block = 80
    blockNumber = GraphBN.fromI64(80);
    const newRate4 = TEST_AMOUNTS.PAYMENT_RATE_HIGH;
    const railRateModifiedEvent4 = createRailRateModifiedEvent(railId1, newRate2, newRate4);
    railRateModifiedEvent4.block.number = blockNumber;
    handleRailRateModified(railRateModifiedEvent4);

    // lockup state after RailRateModified event for rail1
    // settleTokenLockup till block 80
    lockupCurrent = lockupCurrent.plus(blockNumber.minus(lockupLastSettledUntilEpoch).times(lockupRate));
    lockupCurrent = lockupCurrent.minus(newRate2.times(lockupPeriod1)).plus(newRate4.times(lockupPeriod1));
    lockupRate = lockupRate.minus(newRate2).plus(newRate4);
    lockupLastSettledUntilEpoch = railRateModifiedEvent4.block.number;
    assertTokenTotalLockup(TEST_ADDRESSES.TOKEN, lockupCurrent, lockupRate, lockupLastSettledUntilEpoch);

    // rail1: settle rail until block 90 at block = 100
    blockNumber = GraphBN.fromI64(100);
    const totalSettledAmount = GraphBN.fromI64(40)
      .times(TEST_AMOUNTS.PAYMENT_RATE_MEDIUM)
      .plus(GraphBN.fromI64(30).times(TEST_AMOUNTS.PAYMENT_RATE_LOW))
      .plus(GraphBN.fromI64(10).times(TEST_AMOUNTS.PAYMENT_RATE_HIGH));
    const networkFee = calculateNetworkFee(totalSettledAmount);
    const operatorCommission = ZERO_BIG_INT;
    const totalNetPayeeAmount = totalSettledAmount.minus(networkFee).minus(operatorCommission);
    const settledUpto = GraphBN.fromI64(90);
    const railSettledEvent = createRailSettledEvent(
      railId1,
      totalSettledAmount,
      totalNetPayeeAmount,
      operatorCommission,
      networkFee,
      settledUpto,
    );
    railSettledEvent.block.number = blockNumber;
    handleRailSettled(railSettledEvent);

    // lockup state after RailSettled event for rail1
    // settleTokenLockup till block 100
    lockupCurrent = lockupCurrent.plus(blockNumber.minus(lockupLastSettledUntilEpoch).times(lockupRate));
    lockupCurrent = lockupCurrent.minus(totalSettledAmount); // not necessary that lockup reduction is same as totalSettledAmount (in case of validator)
    lockupLastSettledUntilEpoch = railSettledEvent.block.number;
    assertTokenTotalLockup(TEST_ADDRESSES.TOKEN, lockupCurrent, lockupRate, lockupLastSettledUntilEpoch);

    // rail1: terminate rail1 at block = 120
    blockNumber = GraphBN.fromI64(120);
    const endEpoch = blockNumber.plus(lockupPeriod1);
    const railTerminatedEvent = createRailTerminatedEvent(railId1, TEST_ADDRESSES.ACCOUNT, endEpoch);
    railTerminatedEvent.block.number = blockNumber;
    handleRailTerminated(railTerminatedEvent);

    // lockup state after RailTerminated event for rail1
    // settleTokenLockup till block 120
    lockupCurrent = lockupCurrent.plus(blockNumber.minus(lockupLastSettledUntilEpoch).times(lockupRate));
    lockupRate = lockupRate.minus(newRate4);
    lockupLastSettledUntilEpoch = railTerminatedEvent.block.number;
    assertTokenTotalLockup(TEST_ADDRESSES.TOKEN, lockupCurrent, lockupRate, lockupLastSettledUntilEpoch);

    // rail1: Settle terminated rail until block 150 at block = 160
    blockNumber = GraphBN.fromI64(160);
    const totalSettledAmount2 = GraphBN.fromI64(60).times(TEST_AMOUNTS.PAYMENT_RATE_HIGH);
    const networkFee2 = calculateNetworkFee(totalSettledAmount2);
    const operatorCommission2 = ZERO_BIG_INT;
    const totalNetPayeeAmount2 = totalSettledAmount2.minus(networkFee2).minus(operatorCommission2);
    const settledUpto2 = endEpoch;
    const railSettledEvent2 = createRailSettledEvent(
      railId1,
      totalSettledAmount2,
      totalNetPayeeAmount2,
      operatorCommission2,
      networkFee2,
      settledUpto2,
    );
    railSettledEvent2.block.number = blockNumber;
    handleRailSettled(railSettledEvent2);

    const finalizeRailEvent1 = createRailFinalizedEvent(railId1);
    finalizeRailEvent1.block.number = blockNumber;
    handleRailFinalized(finalizeRailEvent1);

    // lockup state after RailSettled event for rail1
    // settleTokenLockup till block 160
    lockupCurrent = lockupCurrent.plus(blockNumber.minus(lockupLastSettledUntilEpoch).times(lockupRate));
    lockupCurrent = lockupCurrent.minus(totalSettledAmount2);
    lockupCurrent = lockupCurrent.minus(lockupFixed1);
    lockupLastSettledUntilEpoch = railSettledEvent2.block.number;
    assertTokenTotalLockup(TEST_ADDRESSES.TOKEN, lockupCurrent, lockupRate, lockupLastSettledUntilEpoch);

    // rail2: terminate rail2 at block = 180
    blockNumber = GraphBN.fromI64(180);
    const endEpoch2 = blockNumber.plus(lockupPeriod2);
    const railTerminatedEvent2 = createRailTerminatedEvent(railId2, TEST_ADDRESSES.ACCOUNT, endEpoch2);
    railTerminatedEvent2.block.number = blockNumber;
    handleRailTerminated(railTerminatedEvent2);

    // lockup state after RailTerminated event for rail2
    // settleTokenLockup till block 180
    lockupCurrent = lockupCurrent.plus(blockNumber.minus(lockupLastSettledUntilEpoch).times(lockupRate));
    lockupRate = lockupRate.minus(newRate3);
    lockupLastSettledUntilEpoch = railTerminatedEvent2.block.number;
    assertTokenTotalLockup(TEST_ADDRESSES.TOKEN, lockupCurrent, lockupRate, lockupLastSettledUntilEpoch);

    // rail2: modify terminated rail's rate at block = 190
    blockNumber = GraphBN.fromI64(190);
    const newRate5 = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const railRateModifiedEvent5 = createRailRateModifiedEvent(railId2, newRate3, newRate5);
    railRateModifiedEvent5.block.number = blockNumber;
    handleRailRateModified(railRateModifiedEvent5);

    // lockup state after RailRateModified event for rail2
    // settleTokenLockup till block 190
    lockupCurrent = lockupCurrent.plus(blockNumber.minus(lockupLastSettledUntilEpoch).times(lockupRate));
    const effectiveLockupPeriod = endEpoch2.minus(blockNumber);
    lockupCurrent = lockupCurrent.plus(effectiveLockupPeriod.times(newRate5.minus(newRate3)));
    lockupLastSettledUntilEpoch = railRateModifiedEvent5.block.number;
    assertTokenTotalLockup(TEST_ADDRESSES.TOKEN, lockupCurrent, lockupRate, lockupLastSettledUntilEpoch);

    // rail2: settle rail2 after end epoch at block = 220
    blockNumber = GraphBN.fromI64(220);
    const totalSettledAmount3 = GraphBN.fromI64(130)
      .times(TEST_AMOUNTS.PAYMENT_RATE_HIGH)
      .plus(GraphBN.fromI64(20).times(TEST_AMOUNTS.PAYMENT_RATE_LOW));
    const networkFee3 = calculateNetworkFee(totalSettledAmount3);
    const operatorCommission3 = ZERO_BIG_INT;
    const totalNetPayeeAmount3 = totalSettledAmount3.minus(networkFee3).minus(operatorCommission3);
    const settledUpto3 = endEpoch2;
    const railSettledEvent3 = createRailSettledEvent(
      railId2,
      totalSettledAmount3,
      totalNetPayeeAmount3,
      operatorCommission3,
      networkFee3,
      settledUpto3,
    );
    railSettledEvent3.block.number = blockNumber;
    handleRailSettled(railSettledEvent3);

    const finalizeRailEvent2 = createRailFinalizedEvent(railId2);
    finalizeRailEvent2.block.number = blockNumber;
    handleRailFinalized(finalizeRailEvent2);

    // lockup state after RailSettled event for rail2
    // settleTokenLockup till block 220
    lockupCurrent = lockupCurrent.plus(blockNumber.minus(lockupLastSettledUntilEpoch).times(lockupRate));
    lockupCurrent = lockupCurrent.minus(totalSettledAmount3);
    lockupCurrent = lockupCurrent.minus(lockupFixed2);
    lockupLastSettledUntilEpoch = railSettledEvent3.block.number;
    assertTokenTotalLockup(TEST_ADDRESSES.TOKEN, lockupCurrent, lockupRate, lockupLastSettledUntilEpoch);

    // After complete rail lifecycle, lockupCurrent and lockupRate should be zero
    // Settlements drain accumulated streaming lockup from lockupCurrent
    // oneTimePayments and rail finalization are responsible for draining fixed lockup from lockupCurrent
    // Rail terminations reduce lockupRate to zero by moving each rail's rate
    assert.bigIntEquals(lockupCurrent, ZERO_BIG_INT);
    assert.bigIntEquals(lockupRate, ZERO_BIG_INT);
    assert.bigIntEquals(lockupLastSettledUntilEpoch, blockNumber);
  });
});
