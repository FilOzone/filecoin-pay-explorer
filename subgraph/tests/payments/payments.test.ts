/* eslint-disable no-underscore-dangle, @typescript-eslint/no-unnecessary-type-assertion */
import { BigInt } from "@graphprotocol/graph-ts";
import { test, describe, afterEach, clearStore, assert, beforeAll } from "matchstick-as";

import { Account, Token, UserToken, Operator, OperatorApproval } from "../../generated/schema";
import {
  handleDepositRecorded,
  handleWithdrawRecorded,
  handleRailCreated,
  handleOperatorApprovalUpdated,
  handleAccountLockupSettled,
} from "../../src/payments";
import {
  DEFAULT_TOKEN_ADDRESS,
  DEFAULT_ACCOUNT_ADDRESS,
  DEFAULT_OPERATOR_ADDRESS,
  mockPaymentsContract,
  mockERC20Contract,
} from "../common";

import {
  createDepositRecordedEvent,
  createWithdrawRecordedEvent,
  createOperatorApprovalUpdatedEvent,
  createAccountLockupSettledEvent,
} from "./utils";

export {
  handleDepositRecorded,
  handleWithdrawRecorded,
  handleRailCreated,
  handleOperatorApprovalUpdated,
  handleAccountLockupSettled,
};

describe("Payments", () => {
  beforeAll(() => {
    mockPaymentsContract();
    mockERC20Contract(DEFAULT_TOKEN_ADDRESS, "Test Token", "TEST", 18);
  });

  afterEach(() => {
    clearStore();
  });

  test("should handle deposit recorded properly", () => {
    const depositAmount = BigInt.fromI32(1000);
    const event = createDepositRecordedEvent(
      DEFAULT_TOKEN_ADDRESS,
      DEFAULT_ACCOUNT_ADDRESS,
      DEFAULT_ACCOUNT_ADDRESS,
      depositAmount,
      false,
    );

    handleDepositRecorded(event);

    // Check if Token entity was created
    const token = Token.load(DEFAULT_TOKEN_ADDRESS);
    assert.assertNotNull(token);
    assert.fieldEquals("Token", DEFAULT_TOKEN_ADDRESS.toHexString(), "name", "Test Token");
    assert.fieldEquals("Token", DEFAULT_TOKEN_ADDRESS.toHexString(), "symbol", "TEST");
    assert.fieldEquals("Token", DEFAULT_TOKEN_ADDRESS.toHexString(), "decimals", "18");
    assert.fieldEquals("Token", DEFAULT_TOKEN_ADDRESS.toHexString(), "userFunds", depositAmount.toString());
    assert.fieldEquals("Token", DEFAULT_TOKEN_ADDRESS.toHexString(), "totalDeposits", depositAmount.toString());
    assert.fieldEquals("Token", DEFAULT_TOKEN_ADDRESS.toHexString(), "volume", depositAmount.toString());
    assert.fieldEquals("Token", DEFAULT_TOKEN_ADDRESS.toHexString(), "totalUsers", "1");

    // Check if Account entity was created
    const account = Account.load(DEFAULT_ACCOUNT_ADDRESS);
    assert.assertNotNull(account);
    assert.fieldEquals(
      "Account",
      DEFAULT_ACCOUNT_ADDRESS.toHexString(),
      "address",
      DEFAULT_ACCOUNT_ADDRESS.toHexString(),
    );
    assert.fieldEquals("Account", DEFAULT_ACCOUNT_ADDRESS.toHexString(), "totalTokens", "1");

    // Check if UserToken entity was created
    const userTokenId = DEFAULT_ACCOUNT_ADDRESS.concat(DEFAULT_TOKEN_ADDRESS);
    const userToken = UserToken.load(userTokenId);
    assert.assertNotNull(userToken);
    assert.fieldEquals("UserToken", userTokenId.toHexString(), "funds", depositAmount.toString());
  });

  test("should handle withdraw recorded properly", () => {
    // First create a deposit
    const depositAmount = BigInt.fromI32(1000);
    const withdrawAmount = BigInt.fromI32(500);

    const depositEvent = createDepositRecordedEvent(
      DEFAULT_TOKEN_ADDRESS,
      DEFAULT_ACCOUNT_ADDRESS,
      DEFAULT_ACCOUNT_ADDRESS,
      depositAmount,
      false,
    );

    const withdrawEvent = createWithdrawRecordedEvent(
      DEFAULT_TOKEN_ADDRESS,
      DEFAULT_ACCOUNT_ADDRESS,
      DEFAULT_ACCOUNT_ADDRESS,
      withdrawAmount,
    );

    handleDepositRecorded(depositEvent);
    handleWithdrawRecorded(withdrawEvent);

    // Check if UserToken funds were updated correctly
    const userTokenId = DEFAULT_ACCOUNT_ADDRESS.concat(DEFAULT_TOKEN_ADDRESS);
    const expectedFunds = depositAmount.minus(withdrawAmount);
    assert.fieldEquals("UserToken", userTokenId.toHexString(), "funds", expectedFunds.toString());

    // Check if Token entity was updated
    const expectedUserFunds = depositAmount.minus(withdrawAmount);
    assert.fieldEquals("Token", DEFAULT_TOKEN_ADDRESS.toHexString(), "userFunds", expectedUserFunds.toString());
    assert.fieldEquals("Token", DEFAULT_TOKEN_ADDRESS.toHexString(), "totalWithdrawals", withdrawAmount.toString());

    // Volume should be deposit + withdraw
    const expectedVolume = depositAmount.plus(withdrawAmount);
    assert.fieldEquals("Token", DEFAULT_TOKEN_ADDRESS.toHexString(), "volume", expectedVolume.toString());
  });

  test("should handle operator approval updated properly", () => {
    const rateAllowance = BigInt.fromI32(100);
    const lockupAllowance = BigInt.fromI32(5000);
    const maxLockupPeriod = BigInt.fromI32(86400); // 1 day in seconds

    const event = createOperatorApprovalUpdatedEvent(
      DEFAULT_TOKEN_ADDRESS,
      DEFAULT_ACCOUNT_ADDRESS,
      DEFAULT_OPERATOR_ADDRESS,
      true,
      rateAllowance,
      lockupAllowance,
      maxLockupPeriod,
    );

    handleOperatorApprovalUpdated(event);

    // Check if Operator entity was created
    const operator = Operator.load(DEFAULT_OPERATOR_ADDRESS);
    assert.assertNotNull(operator);
    assert.fieldEquals(
      "Operator",
      DEFAULT_OPERATOR_ADDRESS.toHexString(),
      "address",
      DEFAULT_OPERATOR_ADDRESS.toHexString(),
    );
    assert.fieldEquals("Operator", DEFAULT_OPERATOR_ADDRESS.toHexString(), "totalApprovals", "1");
    assert.fieldEquals("Operator", DEFAULT_OPERATOR_ADDRESS.toHexString(), "totalTokens", "1");

    // Check if OperatorApproval entity was created
    const operatorApprovalId = DEFAULT_ACCOUNT_ADDRESS.concat(DEFAULT_OPERATOR_ADDRESS).concat(DEFAULT_TOKEN_ADDRESS);
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
  });

  test("should handle account lockup settled properly", () => {
    // First create a UserToken by making a deposit
    const depositAmount = BigInt.fromI32(1000);
    const depositEvent = createDepositRecordedEvent(
      DEFAULT_TOKEN_ADDRESS,
      DEFAULT_ACCOUNT_ADDRESS,
      DEFAULT_ACCOUNT_ADDRESS,
      depositAmount,
      false,
    );
    handleDepositRecorded(depositEvent);

    // Now test lockup settlement
    const lockupCurrent = BigInt.fromI32(500);
    const lockupRate = BigInt.fromI32(10);
    const lockupLastSettledAt = BigInt.fromI32(1234567890);

    const event = createAccountLockupSettledEvent(
      DEFAULT_TOKEN_ADDRESS,
      DEFAULT_ACCOUNT_ADDRESS,
      lockupCurrent,
      lockupRate,
      lockupLastSettledAt,
    );

    handleAccountLockupSettled(event);

    // Check if UserToken lockup fields were updated
    const userTokenId = DEFAULT_ACCOUNT_ADDRESS.concat(DEFAULT_TOKEN_ADDRESS);
    assert.fieldEquals("UserToken", userTokenId.toHexString(), "lockupCurrent", lockupCurrent.toString());
    assert.fieldEquals("UserToken", userTokenId.toHexString(), "lockupRate", lockupRate.toString());
    assert.fieldEquals("UserToken", userTokenId.toHexString(), "lockupLastSettledAt", lockupLastSettledAt.toString());
  });
});
