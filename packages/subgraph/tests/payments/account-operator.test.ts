import { Address, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { afterEach, assert, beforeAll, clearStore, describe, test } from "matchstick-as";

import { AccountOperator } from "../../generated/schema";
import {
  handleOperatorApprovalUpdated,
  handleRailCreated,
  handleRailRateModified,
  handleRailTerminated,
} from "../../src/payments";
import { getAccountOperatorEntityId, getOperatorApprovalEntityId, getRailEntityId } from "../../src/utils/keys";
import { ZERO_BIG_INT } from "../../src/utils/metrics";
import { mockERC20Contract } from "../mocks";
import {
  createOperatorApprovalUpdatedEvent,
  createRailCreatedEvent,
  createRailRateModifiedEvent,
  createRailTerminatedEvent,
} from "./events";
import {
  assertAccountOperatorState,
  assertOperatorApprovalState,
  TEST_ADDRESSES,
  TEST_ALLOWANCES,
  TEST_AMOUNTS,
} from "./fixtures";

const SECOND_ACCOUNT = Address.fromString("0x0000000000000000000000000000000000000007");
const SECOND_TOKEN = Address.fromString("0x0000000000000000000000000000000000000008");
const SECOND_OPERATOR = Address.fromString("0x0000000000000000000000000000000000000009");
const COMMISSION_RATE_BPS = GraphBN.fromI32(100);

function createRail(
  railId: i32,
  payer: Address = TEST_ADDRESSES.ACCOUNT,
  operator: Address = TEST_ADDRESSES.OPERATOR,
): void {
  handleRailCreated(
    createRailCreatedEvent(
      GraphBN.fromI32(railId),
      payer,
      TEST_ADDRESSES.PAYEE,
      TEST_ADDRESSES.VALIDATOR,
      TEST_ADDRESSES.TOKEN,
      operator,
      TEST_ADDRESSES.SERVICE_FEE_RECIPIENT,
      COMMISSION_RATE_BPS,
    ),
  );
}

function updateApproval(token: Address, approved: boolean): void {
  handleOperatorApprovalUpdated(
    createOperatorApprovalUpdatedEvent(
      token,
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.OPERATOR,
      approved,
      TEST_ALLOWANCES.RATE,
      TEST_ALLOWANCES.LOCKUP,
      TEST_ALLOWANCES.MAX_LOCKUP_PERIOD,
    ),
  );
}

describe("AccountOperator projection", () => {
  beforeAll(() => {
    mockERC20Contract(TEST_ADDRESSES.TOKEN, "Test Token", "TEST", 18);
    mockERC20Contract(SECOND_TOKEN, "Second Token", "SECOND", 18);
  });

  afterEach(() => {
    clearStore();
  });

  test("groups payer rails by operator without indexing the payee", () => {
    createRail(1);

    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "0", "0", "0");
    assert.notInStore(
      "AccountOperator",
      getAccountOperatorEntityId(TEST_ADDRESSES.PAYEE, TEST_ADDRESSES.OPERATOR).toHexString(),
    );
    assert.fieldEquals("Rail", getRailEntityId(GraphBN.fromI32(1)).toHexString(), "state", "ZERORATE");
    assert.fieldEquals("Account", TEST_ADDRESSES.ACCOUNT.toHexString(), "totalRails", "1");
    assert.fieldEquals("Account", TEST_ADDRESSES.PAYEE.toHexString(), "totalRails", "1");
    assert.fieldEquals("Operator", TEST_ADDRESSES.OPERATOR.toHexString(), "totalRails", "1");

    createRail(2);
    createRail(3, SECOND_ACCOUNT);

    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "2", "0", "0", "0");
    assertAccountOperatorState(SECOND_ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "0", "0", "0");
    assert.entityCount("AccountOperator", 2);
    assert.fieldEquals("Account", TEST_ADDRESSES.ACCOUNT.toHexString(), "totalRails", "2");
    assert.fieldEquals("Account", SECOND_ACCOUNT.toHexString(), "totalRails", "1");
    assert.fieldEquals("Account", TEST_ADDRESSES.PAYEE.toHexString(), "totalRails", "3");
    assert.fieldEquals("Operator", TEST_ADDRESSES.OPERATOR.toHexString(), "totalRails", "3");
  });

  test("separates one payer's rails across operators", () => {
    createRail(4);
    createRail(5, TEST_ADDRESSES.ACCOUNT, SECOND_OPERATOR);

    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "0", "0", "0");
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, SECOND_OPERATOR, "1", "0", "0", "0");
    assert.entityCount("AccountOperator", 2);
    assert.fieldEquals("Account", TEST_ADDRESSES.ACCOUNT.toHexString(), "totalRails", "2");
    assert.fieldEquals("Operator", TEST_ADDRESSES.OPERATOR.toHexString(), "totalRails", "1");
    assert.fieldEquals("Operator", SECOND_OPERATOR.toHexString(), "totalRails", "1");
  });

  test("tracks indexed active rail state across rate changes and termination", () => {
    updateApproval(TEST_ADDRESSES.TOKEN, true);
    createRail(10);

    const railId = GraphBN.fromI32(10);
    const firstRate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    const secondRate = TEST_AMOUNTS.PAYMENT_RATE_MEDIUM;

    handleRailRateModified(createRailRateModifiedEvent(railId, ZERO_BIG_INT, firstRate));
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "1", "1", "1");
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "state", "ACTIVE");

    handleRailRateModified(createRailRateModifiedEvent(railId, firstRate, secondRate));
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "1", "1", "1");

    handleRailRateModified(createRailRateModifiedEvent(railId, secondRate, ZERO_BIG_INT));
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "1", "1", "1");
    assertOperatorApprovalState(
      TEST_ADDRESSES.ACCOUNT,
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.TOKEN,
      "true",
      TEST_ALLOWANCES.RATE,
      TEST_ALLOWANCES.LOCKUP,
      TEST_ALLOWANCES.MAX_LOCKUP_PERIOD,
      "0",
      "0",
    );

    handleRailRateModified(createRailRateModifiedEvent(railId, ZERO_BIG_INT, firstRate));
    handleRailRateModified(createRailRateModifiedEvent(railId, firstRate, ZERO_BIG_INT));
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "1", "1", "1");

    const termination = createRailTerminatedEvent(railId, TEST_ADDRESSES.ACCOUNT, GraphBN.fromI32(100));
    handleRailTerminated(termination);
    handleRailTerminated(termination);

    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "0", "1", "1");
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "state", "TERMINATED");
    assert.fieldEquals("Account", TEST_ADDRESSES.ACCOUNT.toHexString(), "totalRails", "1");
    assert.fieldEquals("Operator", TEST_ADDRESSES.OPERATOR.toHexString(), "totalRails", "1");
  });

  test("does not decrement active rails for a never-activated rail", () => {
    createRail(20);

    const railId = GraphBN.fromI32(20);
    const termination = createRailTerminatedEvent(railId, TEST_ADDRESSES.ACCOUNT, GraphBN.fromI32(100));
    handleRailTerminated(termination);
    handleRailTerminated(termination);

    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "0", "0", "0");
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "state", "TERMINATED");
  });

  test("clamps an unexpected active-rail decrement at zero", () => {
    updateApproval(TEST_ADDRESSES.TOKEN, true);
    createRail(30);

    const railId = GraphBN.fromI32(30);
    const rate = TEST_AMOUNTS.PAYMENT_RATE_LOW;
    handleRailRateModified(createRailRateModifiedEvent(railId, ZERO_BIG_INT, rate));
    handleRailRateModified(createRailRateModifiedEvent(railId, rate, ZERO_BIG_INT));

    const accountOperatorId = getAccountOperatorEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR);
    const accountOperator = AccountOperator.load(accountOperatorId);
    assert.assertNotNull(accountOperator);
    accountOperator!.totalActiveRails = ZERO_BIG_INT;
    accountOperator!.save();

    handleRailTerminated(createRailTerminatedEvent(railId, TEST_ADDRESSES.ACCOUNT, GraphBN.fromI32(100)));

    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "1", "0", "1", "1");
    assert.fieldEquals("Rail", getRailEntityId(railId).toHexString(), "state", "TERMINATED");
  });

  test("tracks distinct token approvals, revocation, and reapproval", () => {
    updateApproval(TEST_ADDRESSES.TOKEN, true);

    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "0", "0", "1", "1");
    assert.fieldEquals("Account", TEST_ADDRESSES.ACCOUNT.toHexString(), "totalApprovals", "1");
    assert.fieldEquals("Operator", TEST_ADDRESSES.OPERATOR.toHexString(), "totalApprovals", "1");

    updateApproval(TEST_ADDRESSES.TOKEN, true);
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "0", "0", "1", "1");

    updateApproval(TEST_ADDRESSES.TOKEN, false);
    updateApproval(TEST_ADDRESSES.TOKEN, false);
    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "0", "0", "1", "0");
    assert.fieldEquals(
      "OperatorApproval",
      getOperatorApprovalEntityId(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, TEST_ADDRESSES.TOKEN).toHexString(),
      "isApproved",
      "false",
    );

    updateApproval(TEST_ADDRESSES.TOKEN, true);
    updateApproval(SECOND_TOKEN, true);

    assertAccountOperatorState(TEST_ADDRESSES.ACCOUNT, TEST_ADDRESSES.OPERATOR, "0", "0", "2", "2");
    assert.fieldEquals("Account", TEST_ADDRESSES.ACCOUNT.toHexString(), "totalApprovals", "2");
    assert.fieldEquals("Operator", TEST_ADDRESSES.OPERATOR.toHexString(), "totalApprovals", "2");
    assert.fieldEquals("Operator", TEST_ADDRESSES.OPERATOR.toHexString(), "totalTokens", "2");
    assert.entityCount("OperatorApproval", 2);
  });
});
