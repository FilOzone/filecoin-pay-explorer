import { Bytes, ethereum, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { afterEach, assert, beforeAll, clearStore, describe, test } from "matchstick-as";

import { Rail, RailRatePeriod } from "../../generated/schema";
import {
  handleRailCreated,
  handleRailFinalized,
  handleRailRateModified,
  handleRailSettled,
  handleRailTerminated,
} from "../../src/payments";
import { getIdFromTxHashAndLogIndex, getRailEntityId } from "../../src/utils/keys";
import { ZERO_BIG_INT } from "../../src/utils/metrics";
import { mockERC20Contract } from "../mocks";
import {
  createRailCreatedEvent,
  createRailFinalizedEvent,
  createRailRateModifiedEvent,
  createRailSettledEvent,
  createRailTerminatedEvent,
} from "./events";
import {
  assertAccountOperatorState,
  assertRailRatePeriodState,
  setupDeposit,
  setupOperatorApproval,
  TEST_ADDRESSES,
  TEST_AMOUNTS,
} from "./fixtures";

const COMMISSION_RATE_BPS = GraphBN.fromI32(100);
const DEPOSIT_AMOUNT = GraphBN.fromI64(10_000_000_000_000_000);

function setEventPosition(event: ethereum.Event, blockNumber: i32, logIndex: i32): void {
  event.block.number = GraphBN.fromI32(blockNumber);
  event.logIndex = GraphBN.fromI32(logIndex);
}

function getEventId(event: ethereum.Event): Bytes {
  return getIdFromTxHashAndLogIndex(event.transaction.hash, event.logIndex);
}

function createRailAt(railId: GraphBN, blockNumber: i32, logIndex: i32): ethereum.Event {
  setupDeposit(DEPOSIT_AMOUNT);
  setupOperatorApproval();

  const event = createRailCreatedEvent(
    railId,
    TEST_ADDRESSES.ACCOUNT,
    TEST_ADDRESSES.PAYEE,
    TEST_ADDRESSES.VALIDATOR,
    TEST_ADDRESSES.TOKEN,
    TEST_ADDRESSES.OPERATOR,
    TEST_ADDRESSES.SERVICE_FEE_RECIPIENT,
    COMMISSION_RATE_BPS,
  );
  setEventPosition(event, blockNumber, logIndex);
  handleRailCreated(event);

  return event;
}

describe("RailRatePeriod projection", () => {
  beforeAll(() => {
    mockERC20Contract(TEST_ADDRESSES.TOKEN, "Test Token", "TEST", 18);
  });

  afterEach(() => {
    clearStore();
  });

  test("creates the initial zero-rate period before the rail is saved", () => {
    const railId = GraphBN.fromI32(1);
    const creation = createRailAt(railId, 10, 1);
    const initialPeriodId = getEventId(creation);

    assert.entityCount("RailRatePeriod", 1);
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "createdAtEpoch", "10");
    assert.fieldEquals(
      "Rail",
      getRailEntityId(railId).toHexString(),
      "currentRatePeriod",
      initialPeriodId.toHexString(),
    );
    assertRailRatePeriodState(initialPeriodId, railId, ZERO_BIG_INT, GraphBN.fromI32(10), "");
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "0", "1", "1");
  });

  test("opens a positive period on delayed activation", () => {
    const railId = GraphBN.fromI32(2);
    const creation = createRailAt(railId, 10, 1);
    const initialPeriodId = getEventId(creation);
    const rate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, rate);
    setEventPosition(activation, 20, 2);

    handleRailRateModified(activation);

    const activePeriodId = getEventId(activation);
    assert.entityCount("RailRatePeriod", 2);
    assertRailRatePeriodState(initialPeriodId, railId, ZERO_BIG_INT, GraphBN.fromI32(10), "20");
    assertRailRatePeriodState(activePeriodId, railId, rate, GraphBN.fromI32(20), "");
    assert.fieldEquals(
      "Rail",
      getRailEntityId(railId).toHexString(),
      "currentRatePeriod",
      activePeriodId.toHexString(),
    );
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "state", "ACTIVE");
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "totalRateChanges", "0");
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "1", "1", "1");
  });

  test("folds creation and several same-block changes into one period", () => {
    const railId = GraphBN.fromI32(3);
    const creation = createRailAt(railId, 10, 1);
    const initialPeriodId = getEventId(creation);
    const firstRate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const finalRate = TEST_AMOUNTS.PAYMENT_RATE_HIGH;
    const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, firstRate);
    const secondChange = createRailRateModifiedEvent(railId, firstRate, finalRate);
    setEventPosition(activation, 10, 2);
    setEventPosition(secondChange, 10, 3);

    handleRailRateModified(activation);
    handleRailRateModified(secondChange);

    assert.entityCount("RailRatePeriod", 1);
    assertRailRatePeriodState(initialPeriodId, railId, finalRate, GraphBN.fromI32(10), "");
    assert.notInStore("RailRatePeriod", getEventId(activation).toHexString());
    assert.notInStore("RailRatePeriod", getEventId(secondChange).toHexString());
    assert.fieldEquals(
      "Rail",
      getRailEntityId(railId).toHexString(),
      "currentRatePeriod",
      initialPeriodId.toHexString(),
    );
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "paymentRate", finalRate.toString());
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "1", "1", "1");
  });

  test("opens periods across blocks and ignores no-op changes", () => {
    const railId = GraphBN.fromI32(4);
    const creation = createRailAt(railId, 10, 1);
    const firstRate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const secondRate = TEST_AMOUNTS.PAYMENT_RATE_HIGH;
    const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, firstRate);
    const noOp = createRailRateModifiedEvent(railId, firstRate, firstRate);
    const secondChange = createRailRateModifiedEvent(railId, firstRate, secondRate);
    setEventPosition(activation, 20, 2);
    setEventPosition(noOp, 25, 3);
    setEventPosition(secondChange, 30, 4);

    handleRailRateModified(activation);
    handleRailRateModified(noOp);
    handleRailRateModified(secondChange);

    const initialPeriodId = getEventId(creation);
    const firstRatePeriodId = getEventId(activation);
    const secondRatePeriodId = getEventId(secondChange);
    assert.entityCount("RailRatePeriod", 3);
    assertRailRatePeriodState(initialPeriodId, railId, ZERO_BIG_INT, GraphBN.fromI32(10), "20");
    assertRailRatePeriodState(firstRatePeriodId, railId, firstRate, GraphBN.fromI32(20), "30");
    assertRailRatePeriodState(secondRatePeriodId, railId, secondRate, GraphBN.fromI32(30), "");
    assert.notInStore("RailRatePeriod", getEventId(noOp).toHexString());
    assert.fieldEquals(
      "Rail",
      getRailEntityId(railId).toHexString(),
      "currentRatePeriod",
      secondRatePeriodId.toHexString(),
    );
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "totalRateChanges", "1");
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "1", "1", "1");
  });

  test("coalesces several changes after closing an established period in the same block", () => {
    const railId = GraphBN.fromI32(12);
    const creation = createRailAt(railId, 10, 1);
    const firstRate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const intermediateRate = TEST_AMOUNTS.PAYMENT_RATE_MEDIUM;
    const finalRate = TEST_AMOUNTS.PAYMENT_RATE_HIGH;
    const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, firstRate);
    const firstChange = createRailRateModifiedEvent(railId, firstRate, intermediateRate);
    const secondChange = createRailRateModifiedEvent(railId, intermediateRate, finalRate);
    setEventPosition(activation, 20, 2);
    setEventPosition(firstChange, 30, 3);
    setEventPosition(secondChange, 30, 4);

    handleRailRateModified(activation);
    handleRailRateModified(firstChange);
    handleRailRateModified(secondChange);

    const initialPeriodId = getEventId(creation);
    const firstRatePeriodId = getEventId(activation);
    const finalRatePeriodId = getEventId(firstChange);
    assert.entityCount("RailRatePeriod", 3);
    assertRailRatePeriodState(initialPeriodId, railId, ZERO_BIG_INT, GraphBN.fromI32(10), "20");
    assertRailRatePeriodState(firstRatePeriodId, railId, firstRate, GraphBN.fromI32(20), "30");
    assertRailRatePeriodState(finalRatePeriodId, railId, finalRate, GraphBN.fromI32(30), "");
    assert.notInStore("RailRatePeriod", getEventId(secondChange).toHexString());
    assert.fieldEquals(
      "Rail",
      getRailEntityId(railId).toHexString(),
      "currentRatePeriod",
      finalRatePeriodId.toHexString(),
    );
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "paymentRate", finalRate.toString());
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "1", "1", "1");
  });

  test("settlement leaves periods unchanged and a same-block change opens the next period", () => {
    const railId = GraphBN.fromI32(5);
    createRailAt(railId, 10, 1);
    const firstRate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const secondRate = TEST_AMOUNTS.PAYMENT_RATE_MEDIUM;
    const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, firstRate);
    setEventPosition(activation, 20, 2);
    handleRailRateModified(activation);

    const settlement = createRailSettledEvent(
      railId,
      ZERO_BIG_INT,
      ZERO_BIG_INT,
      ZERO_BIG_INT,
      ZERO_BIG_INT,
      GraphBN.fromI32(30),
    );
    setEventPosition(settlement, 30, 3);
    handleRailSettled(settlement);

    const activePeriodId = getEventId(activation);
    assert.entityCount("RailRatePeriod", 2);
    assertRailRatePeriodState(activePeriodId, railId, firstRate, GraphBN.fromI32(20), "");
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "totalSettlements", "1");

    const rateChange = createRailRateModifiedEvent(railId, firstRate, secondRate);
    setEventPosition(rateChange, 30, 4);
    handleRailRateModified(rateChange);

    const secondRatePeriodId = getEventId(rateChange);
    assert.entityCount("RailRatePeriod", 3);
    assertRailRatePeriodState(activePeriodId, railId, firstRate, GraphBN.fromI32(20), "30");
    assertRailRatePeriodState(secondRatePeriodId, railId, secondRate, GraphBN.fromI32(30), "");
    assert.fieldEquals(
      "Rail",
      getRailEntityId(railId).toHexString(),
      "currentRatePeriod",
      secondRatePeriodId.toHexString(),
    );
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "totalRateChanges", "0");
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "1", "1", "1");
  });

  test("caps termination and carries the cap into a later decrease", () => {
    const railId = GraphBN.fromI32(6);
    createRailAt(railId, 10, 1);
    const firstRate = TEST_AMOUNTS.PAYMENT_RATE_HIGH;
    const lowerRate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, firstRate);
    setEventPosition(activation, 20, 2);
    handleRailRateModified(activation);

    const termination = createRailTerminatedEvent(railId, TEST_ADDRESSES.ACCOUNT, GraphBN.fromI32(40));
    setEventPosition(termination, 25, 3);
    handleRailTerminated(termination);

    const activePeriodId = getEventId(activation);
    assertRailRatePeriodState(activePeriodId, railId, firstRate, GraphBN.fromI32(20), "40");
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "0", "1", "1");

    const decrease = createRailRateModifiedEvent(railId, firstRate, lowerRate);
    setEventPosition(decrease, 30, 4);
    handleRailRateModified(decrease);

    const replacementPeriodId = getEventId(decrease);
    assert.entityCount("RailRatePeriod", 3);
    assertRailRatePeriodState(activePeriodId, railId, firstRate, GraphBN.fromI32(20), "30");
    assertRailRatePeriodState(replacementPeriodId, railId, lowerRate, GraphBN.fromI32(30), "40");
    assert.fieldEquals(
      "Rail",
      getRailEntityId(railId).toHexString(),
      "currentRatePeriod",
      replacementPeriodId.toHexString(),
    );
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "state", "TERMINATED");
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "paymentRate", lowerRate.toString());
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "0", "1", "1");
  });

  test("carries a termination cap into a later same-block decrease", () => {
    const railId = GraphBN.fromI32(17);
    createRailAt(railId, 10, 1);
    const firstRate = TEST_AMOUNTS.PAYMENT_RATE_HIGH;
    const lowerRate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, firstRate);
    setEventPosition(activation, 20, 2);
    handleRailRateModified(activation);

    const termination = createRailTerminatedEvent(railId, TEST_ADDRESSES.ACCOUNT, GraphBN.fromI32(40));
    setEventPosition(termination, 25, 3);
    handleRailTerminated(termination);

    const decrease = createRailRateModifiedEvent(railId, firstRate, lowerRate);
    setEventPosition(decrease, 25, 4);
    handleRailRateModified(decrease);

    const activePeriodId = getEventId(activation);
    const replacementPeriodId = getEventId(decrease);
    assert.entityCount("RailRatePeriod", 3);
    assertRailRatePeriodState(activePeriodId, railId, firstRate, GraphBN.fromI32(20), "25");
    assertRailRatePeriodState(replacementPeriodId, railId, lowerRate, GraphBN.fromI32(25), "40");
    assert.fieldEquals(
      "Rail",
      getRailEntityId(railId).toHexString(),
      "currentRatePeriod",
      replacementPeriodId.toHexString(),
    );
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "state", "TERMINATED");
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "0", "1", "1");
  });

  test("finalization after settlement leaves the capped timeline unchanged", () => {
    const railId = GraphBN.fromI32(7);
    createRailAt(railId, 10, 1);
    const rate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, rate);
    setEventPosition(activation, 20, 2);
    handleRailRateModified(activation);

    const termination = createRailTerminatedEvent(railId, TEST_ADDRESSES.ACCOUNT, GraphBN.fromI32(30));
    setEventPosition(termination, 25, 3);
    handleRailTerminated(termination);

    const settlement = createRailSettledEvent(
      railId,
      ZERO_BIG_INT,
      ZERO_BIG_INT,
      ZERO_BIG_INT,
      ZERO_BIG_INT,
      GraphBN.fromI32(30),
    );
    setEventPosition(settlement, 35, 4);
    handleRailSettled(settlement);

    const finalization = createRailFinalizedEvent(railId);
    setEventPosition(finalization, 35, 5);
    handleRailFinalized(finalization);

    const activePeriodId = getEventId(activation);
    assert.entityCount("RailRatePeriod", 2);
    assertRailRatePeriodState(activePeriodId, railId, rate, GraphBN.fromI32(20), "30");
    assert.fieldEquals(
      "Rail",
      getRailEntityId(railId).toHexString(),
      "currentRatePeriod",
      activePeriodId.toHexString(),
    );
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "state", "FINALIZED");
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "totalSettlements", "1");
  });

  test("finalization before settlement leaves the capped timeline unchanged", () => {
    const railId = GraphBN.fromI32(8);
    createRailAt(railId, 10, 1);
    const rate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, rate);
    setEventPosition(activation, 20, 2);
    handleRailRateModified(activation);

    const termination = createRailTerminatedEvent(railId, TEST_ADDRESSES.ACCOUNT, GraphBN.fromI32(30));
    setEventPosition(termination, 25, 3);
    handleRailTerminated(termination);

    const finalization = createRailFinalizedEvent(railId);
    setEventPosition(finalization, 31, 4);
    handleRailFinalized(finalization);

    const activePeriodId = getEventId(activation);
    assert.entityCount("RailRatePeriod", 2);
    assertRailRatePeriodState(activePeriodId, railId, rate, GraphBN.fromI32(20), "30");
    assert.fieldEquals(
      "Rail",
      getRailEntityId(railId).toHexString(),
      "currentRatePeriod",
      activePeriodId.toHexString(),
    );
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "state", "FINALIZED");
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "totalSettlements", "0");
  });

  test(
    "fails when the current rate period is missing",
    () => {
      const railId = GraphBN.fromI32(9);
      createRailAt(railId, 10, 1);
      const rail = Rail.load(getRailEntityId(railId));
      assert.assertNotNull(rail);
      rail!.currentRatePeriod = Bytes.fromHexString("0xdead");
      rail!.save();

      const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, TEST_AMOUNTS.PAYMENT_RATE_LOW);
      setEventPosition(activation, 20, 2);
      handleRailRateModified(activation);
    },
    true,
  );

  test(
    "fails when the current rate does not match oldRate",
    () => {
      const railId = GraphBN.fromI32(10);
      const creation = createRailAt(railId, 10, 1);
      const period = RailRatePeriod.load(getEventId(creation));
      assert.assertNotNull(period);
      period!.rate = TEST_AMOUNTS.PAYMENT_RATE_HIGH;
      period!.save();

      const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, TEST_AMOUNTS.PAYMENT_RATE_LOW);
      setEventPosition(activation, 20, 2);
      handleRailRateModified(activation);
    },
    true,
  );

  test(
    "fails when a terminated rate period cap does not match rail endEpoch",
    () => {
      const railId = GraphBN.fromI32(13);
      createRailAt(railId, 10, 1);
      const rate = TEST_AMOUNTS.PAYMENT_RATE_HIGH;
      const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, rate);
      setEventPosition(activation, 20, 2);
      handleRailRateModified(activation);

      const termination = createRailTerminatedEvent(railId, TEST_ADDRESSES.ACCOUNT, GraphBN.fromI32(40));
      setEventPosition(termination, 25, 3);
      handleRailTerminated(termination);

      const period = RailRatePeriod.load(getEventId(activation));
      assert.assertNotNull(period);
      period!.untilEpoch = GraphBN.fromI32(39);
      period!.save();

      const decrease = createRailRateModifiedEvent(railId, rate, TEST_AMOUNTS.PAYMENT_RATE_LOW);
      setEventPosition(decrease, 30, 4);
      handleRailRateModified(decrease);
    },
    true,
  );

  test(
    "fails when an active rail has a capped current rate period",
    () => {
      const railId = GraphBN.fromI32(14);
      createRailAt(railId, 10, 1);
      const rate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
      const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, rate);
      setEventPosition(activation, 20, 2);
      handleRailRateModified(activation);

      const period = RailRatePeriod.load(getEventId(activation));
      assert.assertNotNull(period);
      period!.untilEpoch = GraphBN.fromI32(40);
      period!.save();

      const rateChange = createRailRateModifiedEvent(railId, rate, TEST_AMOUNTS.PAYMENT_RATE_MEDIUM);
      setEventPosition(rateChange, 30, 3);
      handleRailRateModified(rateChange);
    },
    true,
  );

  test(
    "fails when a finalized rail receives a real rate change",
    () => {
      const railId = GraphBN.fromI32(15);
      createRailAt(railId, 10, 1);
      const rate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
      const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, rate);
      setEventPosition(activation, 20, 2);
      handleRailRateModified(activation);

      const termination = createRailTerminatedEvent(railId, TEST_ADDRESSES.ACCOUNT, GraphBN.fromI32(30));
      setEventPosition(termination, 25, 3);
      handleRailTerminated(termination);

      const finalization = createRailFinalizedEvent(railId);
      setEventPosition(finalization, 31, 4);
      handleRailFinalized(finalization);

      const rateChange = createRailRateModifiedEvent(railId, rate, TEST_AMOUNTS.PAYMENT_RATE_MEDIUM);
      setEventPosition(rateChange, 32, 5);
      handleRailRateModified(rateChange);
    },
    true,
  );

  test(
    "fails when a terminated rate change is not before endEpoch",
    () => {
      const railId = GraphBN.fromI32(11);
      createRailAt(railId, 10, 1);
      const rate = TEST_AMOUNTS.PAYMENT_RATE_HIGH;
      const activation = createRailRateModifiedEvent(railId, ZERO_BIG_INT, rate);
      setEventPosition(activation, 20, 2);
      handleRailRateModified(activation);

      const termination = createRailTerminatedEvent(railId, TEST_ADDRESSES.ACCOUNT, GraphBN.fromI32(30));
      setEventPosition(termination, 25, 3);
      handleRailTerminated(termination);

      const decrease = createRailRateModifiedEvent(railId, rate, TEST_AMOUNTS.PAYMENT_RATE_LOW);
      setEventPosition(decrease, 30, 4);
      handleRailRateModified(decrease);
    },
    true,
  );
});
