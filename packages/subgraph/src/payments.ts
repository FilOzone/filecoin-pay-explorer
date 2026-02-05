import { Address, Bytes, log } from "@graphprotocol/graph-ts";
import {
  AccountLockupSettled as AccountLockupSettledEvent,
  DepositRecorded as DepositRecordedEvent,
  OperatorApprovalUpdated as OperatorApprovalUpdatedEvent,
  RailCreated as RailCreatedEvent,
  RailFinalized as RailFinalizedEvent,
  RailLockupModified as RailLockupModifiedEvent,
  RailOneTimePaymentProcessed as RailOneTimePaymentProcessedEvent,
  RailRateModified as RailRateModifiedEvent,
  RailSettled as RailSettledEvent,
  RailTerminated as RailTerminatedEvent,
  WithdrawRecorded as WithdrawRecordedEvent,
} from "../generated/Payments/Payments";
import { Account, OperatorApproval, Rail, Settlement, Token, UserToken } from "../generated/schema";
import {
  createOrLoadAccountByAddress,
  createOrLoadOperator,
  createOrLoadOperatorToken,
  createOrLoadUserToken,
  createRail,
  createRateChangeQueue,
  getLockupLastSettledUntilTimestamp,
  getTokenDetails,
  updateOperatorLockup,
  updateOperatorRate,
  updateOperatorTokenLockup,
  updateOperatorTokenRate,
} from "./utils/helpers";
import { getRailEntityId, getSettlementEntityId } from "./utils/keys";
import { MetricsCollectionOrchestrator, ONE_BIG_INT, ZERO_BIG_INT } from "./utils/metrics";

export function handleAccountLockupSettled(event: AccountLockupSettledEvent): void {
  const tokenAddress = event.params.token;
  const ownerAddress = event.params.owner;
  const lockupLastSettledUntilEpoch = event.params.lockupLastSettledAt;

  const userTokenId = ownerAddress.concat(tokenAddress);
  const userToken = UserToken.load(userTokenId);

  if (!userToken) {
    log.debug("[handleAccountLockupSettled] UserToken not found for id: {}", [userTokenId.toHexString()]);
    return;
  }

  userToken.lockupCurrent = event.params.lockupCurrent;
  userToken.lockupRate = event.params.lockupRate;
  userToken.lockupLastSettledUntilEpoch = lockupLastSettledUntilEpoch;
  userToken.lockupLastSettledUntilTimestamp = getLockupLastSettledUntilTimestamp(
    lockupLastSettledUntilEpoch,
    event.block.number,
    event.block.timestamp,
  );

  userToken.save();
}

export function handleOperatorApprovalUpdated(event: OperatorApprovalUpdatedEvent): void {
  const tokenAddress = event.params.token;
  const clientAddress = event.params.client;
  const operatorAddress = event.params.operator;
  const isApproved = event.params.approved;
  const rateAllowance = event.params.rateAllowance;
  const lockupAllowance = event.params.lockupAllowance;
  const maxLockupPeriod = event.params.maxLockupPeriod;

  const clientAccount = Account.load(clientAddress);

  let isNewApproval = false;

  const operatorWithIsNew = createOrLoadOperator(operatorAddress);
  const operator = operatorWithIsNew.operator;
  const isNewOperator = operatorWithIsNew.isNew;

  const operatorTokenWithIsNew = createOrLoadOperatorToken(operator.id, tokenAddress);
  const operatorToken = operatorTokenWithIsNew.operatorToken;
  const isNewOperatorToken = operatorTokenWithIsNew.isNew;

  const id = clientAddress.concat(operator.id).concat(tokenAddress);
  let operatorApproval = OperatorApproval.load(id);

  if (!operatorApproval) {
    isNewApproval = true;
    operatorApproval = new OperatorApproval(id);
    operatorApproval.client = clientAddress;
    operatorApproval.operator = operatorAddress;
    operatorApproval.token = tokenAddress;
    operatorApproval.lockupAllowance = ZERO_BIG_INT;
    operatorApproval.lockupUsage = ZERO_BIG_INT;
    operatorApproval.rateUsage = ZERO_BIG_INT;

    operator.totalApprovals = operator.totalApprovals.plus(ONE_BIG_INT);
    if (clientAccount) {
      clientAccount.totalApprovals = clientAccount.totalApprovals.plus(ONE_BIG_INT);
      clientAccount.save();
    }
  }

  operator.totalTokens = isNewOperatorToken ? operator.totalTokens.plus(ONE_BIG_INT) : operator.totalTokens;

  operatorToken.lockupAllowance = lockupAllowance;
  operatorToken.rateAllowance = rateAllowance;

  operatorApproval.rateAllowance = rateAllowance;
  operatorApproval.lockupAllowance = lockupAllowance;
  operatorApproval.isApproved = isApproved;
  operatorApproval.maxLockupPeriod = maxLockupPeriod;

  operator.save();
  operatorApproval.save();
  operatorToken.save();

  // update Metrics
  MetricsCollectionOrchestrator.collectOperatorApprovalMetrics(
    operatorAddress,
    isNewApproval,
    isNewOperator,
    event.block.timestamp,
    event.block.number,
  );
}

export function handleRailCreated(event: RailCreatedEvent): void {
  const railId = event.params.railId;
  const payeeAddress = event.params.payee;
  const payerAddress = event.params.payer;
  const arbiter = event.params.validator;
  const tokenAddress = event.params.token;
  const operatorAddress = event.params.operator;
  const commissionRateBps = event.params.commissionRateBps;
  const serviceFeeRecipient = event.params.serviceFeeRecipient;

  const payerAccountWithIsNew = createOrLoadAccountByAddress(payerAddress);
  const payerAccount = payerAccountWithIsNew.account;
  const isNewPayer = payerAccount.totalRails.equals(ZERO_BIG_INT);
  const isNewPayerAccount = payerAccountWithIsNew.isNew;
  const payeeAccountWithIsNew = createOrLoadAccountByAddress(payeeAddress);
  const payeeAccount = payeeAccountWithIsNew.account;
  const isNewPayee = payeeAccount.totalRails.equals(ZERO_BIG_INT);
  const isNewPayeeAccount = payeeAccountWithIsNew.isNew;

  const operatorWithIsNew = createOrLoadOperator(operatorAddress);
  const operator = operatorWithIsNew.operator;
  const isNewOperator = operatorWithIsNew.isNew;

  payerAccount.totalRails = payerAccount.totalRails.plus(ONE_BIG_INT);
  payeeAccount.totalRails = payeeAccount.totalRails.plus(ONE_BIG_INT);
  operator.totalRails = operator.totalRails.plus(ONE_BIG_INT);

  const rail = createRail(
    railId,
    payerAddress,
    payeeAddress,
    operatorAddress,
    tokenAddress,
    arbiter,
    event.block.number,
    commissionRateBps,
    serviceFeeRecipient,
    event.block.timestamp,
  );

  payerAccount.save();
  payeeAccount.save();
  operator.save();

  // Collect Metrics
  const newAccounts = (isNewPayerAccount ? ONE_BIG_INT : ZERO_BIG_INT).plus(
    isNewPayeeAccount ? ONE_BIG_INT : ZERO_BIG_INT,
  );
  MetricsCollectionOrchestrator.collectRailCreationMetrics(
    rail,
    newAccounts,
    isNewPayer,
    isNewPayee,
    isNewOperator,
    event.block.timestamp,
    event.block.number,
  );
}

export function handleRailTerminated(event: RailTerminatedEvent): void {
  const railId = event.params.railId;

  const rail = Rail.load(getRailEntityId(railId));

  if (!rail) {
    log.warning("[handleRailTerminated] Rail not found for railId: {}", [railId.toString()]);
    return;
  }

  const previousRailState = rail.state;
  rail.state = "TERMINATED";
  rail.endEpoch = event.params.endEpoch;

  const payerToken = UserToken.load(rail.payer.concat(rail.token));
  if (payerToken) {
    payerToken.lockupRate = payerToken.lockupRate.minus(rail.paymentRate);
    payerToken.save();
  }

  rail.save();

  // collect rail state change metrics
  MetricsCollectionOrchestrator.collectRailStateChangeMetrics(
    previousRailState,
    "TERMINATED",
    event.block.timestamp,
    event.block.number,
  );
}

export function handleRailLockupModified(event: RailLockupModifiedEvent): void {
  const railId = event.params.railId;
  const oldLockupPeriod = event.params.oldLockupPeriod;
  const newLockupPeriod = event.params.newLockupPeriod;
  const oldLockupFixed = event.params.oldLockupFixed;
  const newLockupFixed = event.params.newLockupFixed;

  const rail = Rail.load(Bytes.fromByteArray(Bytes.fromBigInt(railId)));

  if (!rail) {
    log.warning("[handleRailLockupModified] Rail not found for railId: {}", [railId.toString()]);
    return;
  }

  const isTerminated = rail.state === "TERMINATED";
  const operatorApprovalId = rail.payer.concat(rail.operator).concat(rail.token);
  const operatorApproval = OperatorApproval.load(operatorApprovalId);
  const operatorToken = createOrLoadOperatorToken(rail.operator, rail.token).operatorToken;

  rail.lockupFixed = event.params.newLockupFixed;
  if (!isTerminated) {
    rail.lockupPeriod = event.params.newLockupPeriod;
  }
  rail.save();

  // Update token lockup metrics
  const token = Token.load(rail.token);
  if (token) {
    // Fixed lockup delta
    const fixedDelta = newLockupFixed.minus(oldLockupFixed);
    token.totalFixedLockup = token.totalFixedLockup.plus(fixedDelta);

    // Streaming lockup delta (only if not terminated)
    if (!isTerminated) {
      const oldStreaming = rail.paymentRate.times(oldLockupPeriod);
      const newStreaming = rail.paymentRate.times(newLockupPeriod);
      const streamingDelta = newStreaming.minus(oldStreaming);
      token.totalStreamingLockup = token.totalStreamingLockup.plus(streamingDelta);
    }
    token.save();
  }

  let oldLockup = oldLockupFixed;
  let newLockup = newLockupFixed;

  if (!isTerminated) {
    oldLockup = oldLockupFixed.plus(rail.paymentRate.times(oldLockupPeriod));
    newLockup = newLockupFixed.plus(rail.paymentRate.times(newLockupPeriod));
  }

  updateOperatorLockup(operatorApproval, oldLockup, newLockup);
  updateOperatorTokenLockup(operatorToken, oldLockup, newLockup);
}

export function handleRailRateModified(event: RailRateModifiedEvent): void {
  const railId = event.params.railId;
  const oldRate = event.params.oldRate;
  const newRate = event.params.newRate;

  const rail = Rail.load(getRailEntityId(railId));

  if (!rail) {
    log.warning("[handleRailPaymentRateModified] Rail not found for railId: {}", [railId.toString()]);
    return;
  }

  if (oldRate.equals(ZERO_BIG_INT) && newRate.gt(ZERO_BIG_INT) && rail.state !== "Active") {
    rail.state = "ACTIVE";

    // Collect rail State change metrics
    MetricsCollectionOrchestrator.collectRailStateChangeMetrics(
      "ZERORATE",
      "ACTIVE",
      event.block.timestamp,
      event.block.number,
    );
  }

  const rateChangeQueue = rail.rateChangeQueue.load();
  if (oldRate.notEqual(newRate) && rail.settledUpto.notEqual(event.block.number)) {
    if (oldRate.equals(ZERO_BIG_INT) && rateChangeQueue.length === 0) {
      rail.settledUpto = event.block.number;
    } else {
      if (
        rateChangeQueue.length === 0 ||
        event.block.number.notEqual(rateChangeQueue[rateChangeQueue.length - 1].untilEpoch)
      ) {
        const startEpoch =
          rateChangeQueue.length === 0 ? rail.settledUpto : rateChangeQueue[rateChangeQueue.length - 1].untilEpoch;
        const isNew = createRateChangeQueue(rail, startEpoch, event.block.number, oldRate).isNew;
        rail.totalRateChanges = rail.totalRateChanges.plus(isNew ? ONE_BIG_INT : ZERO_BIG_INT);
      }
    }
  }

  rail.paymentRate = newRate;

  rail.save();

  const operatorApprovalId = rail.payer.concat(rail.operator).concat(rail.token);
  const operatorApproval = OperatorApproval.load(operatorApprovalId);
  const operatorToken = createOrLoadOperatorToken(rail.operator, rail.token).operatorToken;

  const payerToken = UserToken.load(rail.payer.concat(rail.token));

  if (!operatorApproval) {
    log.warning("[handleRailPaymentRateModified] Operator approval not found for railId: {}", [railId.toString()]);
    return;
  }

  const isTerminated = rail.state === "TERMINATED";
  if (!isTerminated) {
    updateOperatorRate(operatorApproval, oldRate, newRate);
    updateOperatorTokenRate(operatorToken, oldRate, newRate);

    if (payerToken) {
      payerToken.lockupRate = payerToken.lockupRate.minus(oldRate).plus(newRate);
      payerToken.save();
    }
  }

  if (oldRate.notEqual(newRate)) {
    let effectiveLockupPeriod = ZERO_BIG_INT;
    if (isTerminated) {
      effectiveLockupPeriod = rail.endEpoch.minus(event.block.number);
      if (effectiveLockupPeriod.lt(ZERO_BIG_INT)) {
        effectiveLockupPeriod = ZERO_BIG_INT;
      }
    } else if (payerToken) {
      effectiveLockupPeriod = rail.lockupPeriod.minus(event.block.number.minus(payerToken.lockupLastSettledUntilEpoch));
    }
    if (effectiveLockupPeriod.gt(ZERO_BIG_INT)) {
      const oldLockup = oldRate.times(effectiveLockupPeriod);
      const newLockup = newRate.times(effectiveLockupPeriod);
      // update operator lockup usage and save
      updateOperatorLockup(operatorApproval, oldLockup, newLockup);
      updateOperatorTokenLockup(operatorToken, oldLockup, newLockup);

      // Update token streaming lockup
      if (!isTerminated) {
        const token = Token.load(rail.token);
        if (token) {
          const streamingDelta = newLockup.minus(oldLockup);
          token.totalStreamingLockup = token.totalStreamingLockup.plus(streamingDelta);
          token.save();
        }
      }
      return;
    }
  }
  operatorApproval.save();
  operatorToken.save();
}

export function handleRailSettled(event: RailSettledEvent): void {
  const railId = event.params.railId;
  const totalSettledAmount = event.params.totalSettledAmount;
  const totalNetPayeeAmount = event.params.totalNetPayeeAmount;
  const operatorCommission = event.params.operatorCommission;
  const networkFee = event.params.networkFee;
  const timestamp = event.block.timestamp;
  const blockNumber = event.block.number;

  const rail = Rail.load(getRailEntityId(railId));

  if (!rail) {
    log.warning("[handleSettlementCompleted] Rail not found for railId: {}", [railId.toString()]);
    return;
  }

  // Update rail aggregate data
  rail.totalSettledAmount = rail.totalSettledAmount.plus(totalSettledAmount);
  rail.totalNetPayeeAmount = rail.totalNetPayeeAmount.plus(totalNetPayeeAmount);
  rail.totalCommission = rail.totalCommission.plus(operatorCommission);
  rail.totalSettlements = rail.totalSettlements.plus(ONE_BIG_INT);
  rail.settledUpto = event.params.settledUpTo;

  // Create a new Settlement entity
  const settlementId = getSettlementEntityId(event.transaction.hash, event.logIndex);
  const settlement = new Settlement(settlementId);
  const operatorToken = createOrLoadOperatorToken(rail.operator, rail.token).operatorToken;

  settlement.rail = rail.id;
  settlement.totalSettledAmount = totalSettledAmount;
  settlement.totalNetPayeeAmount = totalNetPayeeAmount;
  settlement.operatorCommission = operatorCommission;
  settlement.filBurned = networkFee;
  settlement.settledUpto = event.params.settledUpTo;
  settlement.blockNumber = blockNumber;
  settlement.createdAt = timestamp;

  operatorToken.settledAmount = operatorToken.settledAmount.plus(totalSettledAmount);
  operatorToken.volume = operatorToken.volume.plus(totalSettledAmount);
  operatorToken.commissionEarned = operatorToken.commissionEarned.plus(operatorCommission);

  // update funds for payer and payee
  const payerToken = UserToken.load(rail.payer.concat(rail.token));
  const payeeToken = createOrLoadUserToken(Address.fromBytes(rail.payee), Address.fromBytes(rail.token)).userToken;
  const token = Token.load(rail.token);
  if (token) {
    token.userFunds = token.userFunds.minus(operatorCommission);
    token.totalSettledAmount = token.totalSettledAmount.plus(totalSettledAmount);
    token.save();
  }

  if (payerToken) {
    payerToken.funds = payerToken.funds.minus(totalSettledAmount);
    payerToken.payout = payerToken.payout.plus(totalSettledAmount);
    payerToken.save();
  }

  if (payeeToken) {
    payeeToken.funds = payeeToken.funds.plus(totalNetPayeeAmount);
    payeeToken.fundsCollected = payeeToken.fundsCollected.plus(totalNetPayeeAmount);
    payeeToken.save();
  }

  rail.save();
  settlement.save();
  operatorToken.save();

  // collect metrics
  MetricsCollectionOrchestrator.collectSettlementMetrics(
    rail,
    totalSettledAmount,
    totalNetPayeeAmount,
    operatorCommission,
    networkFee,
    timestamp,
    blockNumber,
  );
}

export function handleDepositRecorded(event: DepositRecordedEvent): void {
  const tokenAddress = event.params.token;
  const accountAddress = event.params.to;
  const amount = event.params.amount;

  const tokenWithIsNew = getTokenDetails(tokenAddress);
  const token = tokenWithIsNew.token;
  const isNewToken = tokenWithIsNew.isNew;

  const accountWithIsNew = createOrLoadAccountByAddress(accountAddress);
  const account = accountWithIsNew.account;
  const isNewAccount = accountWithIsNew.isNew;

  const userTokenWithIsNew = createOrLoadUserToken(accountAddress, tokenAddress);
  const userToken = userTokenWithIsNew.userToken;
  const isNewUserToken = userTokenWithIsNew.isNew;

  token.userFunds = token.userFunds.plus(amount);
  token.totalDeposits = token.totalDeposits.plus(amount);
  token.volume = token.volume.plus(amount);
  token.totalUsers = isNewUserToken ? token.totalUsers.plus(ONE_BIG_INT) : token.totalUsers;
  token.save();

  if (isNewUserToken) {
    account.totalTokens = account.totalTokens.plus(ONE_BIG_INT);
    account.save();
  }

  userToken.funds = userToken.funds.plus(amount);
  userToken.save();

  // Collect Metrics
  MetricsCollectionOrchestrator.collectTokenActivityMetrics(
    tokenAddress,
    amount,
    true,
    isNewAccount,
    isNewToken,
    event.block.timestamp,
    event.block.number,
  );
}

export function handleWithdrawRecorded(event: WithdrawRecordedEvent): void {
  const tokenAddress = event.params.token;
  const accountAddress = event.params.from;
  const amount = event.params.amount;

  const userTokenId = accountAddress.concat(tokenAddress);
  const userToken = UserToken.load(userTokenId);
  if (!userToken) {
    log.warning("[handleWithdrawRecorded] UserToken not found for id: {}", [userTokenId.toHexString()]);
    return;
  }
  userToken.funds = userToken.funds.minus(amount);
  const token = Token.load(userToken.token);
  if (token) {
    token.userFunds = token.userFunds.minus(amount);
    token.totalWithdrawals = token.totalWithdrawals.plus(amount);
    token.volume = token.volume.plus(amount);
    token.save();
  }
  userToken.save();

  // collect Metrics
  MetricsCollectionOrchestrator.collectTokenActivityMetrics(
    tokenAddress,
    amount,
    false,
    false,
    false,
    event.block.timestamp,
    event.block.number,
  );
}

export function handleRailOneTimePaymentProcessed(event: RailOneTimePaymentProcessedEvent): void {
  const railId = event.params.railId;
  const netPayeeAmount = event.params.netPayeeAmount;
  const operatorCommission = event.params.operatorCommission;
  const networkFee = event.params.networkFee;
  const oneTimePayment = operatorCommission.plus(netPayeeAmount).plus(networkFee);

  const rail = Rail.load(getRailEntityId(railId));

  if (!rail) {
    log.warning("[handleRailOneTimePaymentProcessed] Rail not found for railId: {}", [railId.toString()]);
    return;
  }

  rail.lockupFixed = rail.lockupFixed.minus(oneTimePayment);
  rail.totalNetPayeeAmount = rail.totalNetPayeeAmount.plus(netPayeeAmount);
  rail.totalCommission = rail.totalCommission.plus(operatorCommission);
  rail.save();

  const payerToken = UserToken.load(rail.payer.concat(rail.token));
  const payeeToken = createOrLoadUserToken(Address.fromBytes(rail.payee), Address.fromBytes(rail.token)).userToken;
  const serviceFeeRecipientUserToken = createOrLoadUserToken(
    Address.fromBytes(rail.serviceFeeRecipient),
    Address.fromBytes(rail.token),
  ).userToken;
  const token = Token.load(rail.token);
  if (token) {
    token.userFunds = token.userFunds.minus(networkFee);
    token.totalFixedLockup = token.totalFixedLockup.minus(oneTimePayment);
    token.save();
  }
  if (payerToken) {
    payerToken.funds = payerToken.funds.minus(oneTimePayment);
    payerToken.save();
  }
  if (payeeToken) {
    payeeToken.funds = payeeToken.funds.plus(netPayeeAmount);
    payeeToken.fundsCollected = payeeToken.fundsCollected.plus(netPayeeAmount);
    payeeToken.save();
  }
  if (serviceFeeRecipientUserToken) {
    serviceFeeRecipientUserToken.funds = serviceFeeRecipientUserToken.funds.plus(operatorCommission);
    serviceFeeRecipientUserToken.save();
  }

  const operatorApprovalId = rail.payer.concat(rail.operator).concat(rail.token);
  const operatorApproval = OperatorApproval.load(operatorApprovalId);
  const operatorToken = createOrLoadOperatorToken(rail.operator, rail.token).operatorToken;

  if (!operatorApproval) {
    log.warning("[handleRailOneTimePaymentProcessed] Operator approval not found for railId: {}", [railId.toString()]);
    return;
  }

  operatorApproval.lockupAllowance = operatorApproval.lockupAllowance.minus(oneTimePayment);
  operatorApproval.lockupUsage = operatorApproval.lockupUsage.minus(oneTimePayment);
  operatorToken.lockupAllowance = operatorToken.lockupAllowance.minus(oneTimePayment);
  operatorToken.lockupUsage = operatorToken.lockupUsage.minus(oneTimePayment);
  operatorToken.commissionEarned = operatorToken.commissionEarned.plus(operatorCommission);
  operatorToken.volume = operatorToken.volume.plus(oneTimePayment);
  operatorApproval.save();
  operatorToken.save();

  MetricsCollectionOrchestrator.collectOneTimePaymentMetrics(networkFee, event.block.timestamp, event.block.number);
}

export function handleRailFinalized(event: RailFinalizedEvent): void {
  const railId = event.params.railId;

  const rail = Rail.load(getRailEntityId(railId));

  if (!rail) {
    log.warning("[handleRailFinalized] Rail not found for railId: {}", [railId.toString()]);
    return;
  }

  const operatorAprrovalId = rail.payer.concat(rail.operator).concat(rail.token);
  const operatorApproval = OperatorApproval.load(operatorAprrovalId);
  const operatorToken = createOrLoadOperatorToken(rail.operator, rail.token).operatorToken;
  const oldLockup = rail.lockupFixed.plus(rail.lockupPeriod.times(rail.paymentRate));
  updateOperatorLockup(operatorApproval, oldLockup, ZERO_BIG_INT);
  updateOperatorTokenLockup(operatorToken, oldLockup, ZERO_BIG_INT);

  // Reduce token lockup metrics by rail's fixed and streaming lockup
  const token = Token.load(rail.token);
  if (token) {
    token.totalFixedLockup = token.totalFixedLockup.minus(rail.lockupFixed);
    const streamingLockup = rail.lockupPeriod.times(rail.paymentRate);
    token.totalStreamingLockup = token.totalStreamingLockup.minus(streamingLockup);
    token.save();
  }

  rail.state = "FINALIZED";
  rail.save();

  // Collect rail state change metrics
  MetricsCollectionOrchestrator.collectRailStateChangeMetrics(
    rail.state,
    "FINALIZED",
    event.block.timestamp,
    event.block.number,
  );
}
