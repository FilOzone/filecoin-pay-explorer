/* eslint-disable no-underscore-dangle */
import { Address, Bytes, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { erc20 } from "../../generated/Payments/erc20";

import {
  Account,
  Operator,
  OperatorApproval,
  OperatorToken,
  PaymentsMetric,
  Rail,
  RateChangeQueue,
  Token,
  UserToken,
} from "../../generated/schema";
import { DEFAULT_DECIMALS } from "./constants";
import {
  getOperatorApprovalEntityId,
  getOperatorTokenEntityId,
  getRailEntityId,
  getRateChangeQueueEntityId,
  getUserTokenEntityId,
} from "./keys";
import { ZERO_BIG_INT } from "./metrics";

class TokenDetails {
  constructor(
    public token: Token,
    public isNew: boolean,
  ) {}
}

class AccountWithIsNew {
  constructor(
    public account: Account,
    public isNew: boolean,
  ) {}
}

class UserTokenWithIsNew {
  constructor(
    public userToken: UserToken,
    public isNew: boolean,
  ) {}
}

class OperatorWithIsNew {
  constructor(
    public operator: Operator,
    public isNew: boolean,
  ) {}
}

class OperatorTokenWithIsNew {
  constructor(
    public operatorToken: OperatorToken,
    public isNew: boolean,
  ) {}
}

class RateChangeQueueWithIsNew {
  constructor(
    public rateChangeQueue: RateChangeQueue,
    public isNew: boolean,
  ) {}
}

// Alternative Account entity function for payments-related code
export const createOrLoadAccountByAddress = (address: Address): AccountWithIsNew => {
  let account = Account.load(address);

  if (!account) {
    account = new Account(address);
    account.address = address;
    account.totalRails = ZERO_BIG_INT;
    account.totalApprovals = ZERO_BIG_INT;
    account.totalTokens = ZERO_BIG_INT;
    account.save();
    return new AccountWithIsNew(account, true);
  }

  return new AccountWithIsNew(account, false);
};

// Token entity functions
export const getTokenDetails = (address: Address): TokenDetails => {
  let token = Token.load(address);

  if (!token) {
    token = new Token(address);

    const erc20Contract = erc20.bind(address);
    const tokenNameResult = erc20Contract.try_name();
    const tokenSymbolResult = erc20Contract.try_symbol();
    const tokenDecimalsResult = erc20Contract.try_decimals();

    token.name = tokenNameResult.value;
    token.symbol = tokenSymbolResult.value;
    token.decimals = GraphBN.fromI32(tokenDecimalsResult.value);

    if (tokenNameResult.reverted) {
      token.name = "Unknown";
    }

    if (tokenSymbolResult.reverted) {
      token.symbol = "UNKNOWN";
    }

    if (tokenDecimalsResult.reverted) {
      token.decimals = DEFAULT_DECIMALS;
    }

    token.volume = ZERO_BIG_INT;
    token.totalDeposits = ZERO_BIG_INT;
    token.totalWithdrawals = ZERO_BIG_INT;
    token.totalSettledAmount = ZERO_BIG_INT;
    token.userFunds = ZERO_BIG_INT;
    token.operatorCommission = ZERO_BIG_INT;
    token.totalUsers = ZERO_BIG_INT;

    return new TokenDetails(token, true);
  }

  return new TokenDetails(token, false);
};

// UserToken entity functions
export const createOrLoadUserToken = (account: Address, token: Address): UserTokenWithIsNew => {
  const id = getUserTokenEntityId(account, token);
  let userToken = UserToken.load(id);

  if (!userToken) {
    userToken = new UserToken(id);
    userToken.account = account;
    userToken.token = token;
    userToken.funds = ZERO_BIG_INT;
    userToken.lockupCurrent = ZERO_BIG_INT;
    userToken.lockupRate = ZERO_BIG_INT;
    userToken.lockupLastSettledAt = ZERO_BIG_INT;
    userToken.save();
    return new UserTokenWithIsNew(userToken, true);
  }

  return new UserTokenWithIsNew(userToken, false);
};

// Operator entity functions
export const createOrLoadOperator = (address: Address): OperatorWithIsNew => {
  let operator = Operator.load(address);

  if (!operator) {
    operator = new Operator(address);
    operator.address = address;
    operator.totalRails = ZERO_BIG_INT;
    operator.totalApprovals = ZERO_BIG_INT;
    operator.totalTokens = ZERO_BIG_INT;
    operator.save();
    return new OperatorWithIsNew(operator, true);
  }

  return new OperatorWithIsNew(operator, false);
};

// OperatorApproval entity functions
export const createOperatorApproval = (
  client: Address,
  operator: Address,
  token: Address,
  lockupAllowance: GraphBN,
  rateAllowance: GraphBN,
): OperatorApproval => {
  const id = getOperatorApprovalEntityId(client, operator, token);
  const operatorApproval = new OperatorApproval(id);
  operatorApproval.client = client;
  operatorApproval.operator = operator;
  operatorApproval.token = token;
  operatorApproval.lockupAllowance = lockupAllowance;
  operatorApproval.lockupUsage = ZERO_BIG_INT;
  operatorApproval.rateAllowance = rateAllowance;
  operatorApproval.rateUsage = ZERO_BIG_INT;
  operatorApproval.save();

  return operatorApproval;
};

export const createOrLoadOperatorToken = (operator: Bytes, token: Bytes): OperatorTokenWithIsNew => {
  const id = getOperatorTokenEntityId(operator, token);
  let operatorToken = OperatorToken.load(id);

  if (!operatorToken) {
    operatorToken = new OperatorToken(id);
    operatorToken.operator = operator;
    operatorToken.token = token;
    operatorToken.commissionEarned = ZERO_BIG_INT;
    operatorToken.volume = ZERO_BIG_INT;
    operatorToken.lockupAllowance = ZERO_BIG_INT;
    operatorToken.rateAllowance = ZERO_BIG_INT;
    operatorToken.lockupUsage = ZERO_BIG_INT;
    operatorToken.rateUsage = ZERO_BIG_INT;
    operatorToken.settledAmount = ZERO_BIG_INT;

    operatorToken.save();

    return new OperatorTokenWithIsNew(operatorToken, true);
  }

  return new OperatorTokenWithIsNew(operatorToken, false);
};

// Rail entity functions
export const createRail = (
  railId: GraphBN,
  payer: Address,
  payee: Address,
  operator: Address,
  token: Address,
  arbiter: Address,
  settledUpTo: GraphBN,
  commissionRateBps: GraphBN,
  serviceFeeRecipient: Address,
  timestamp: GraphBN,
): Rail => {
  const rail = new Rail(getRailEntityId(railId));
  rail.railId = railId;
  rail.payer = payer;
  rail.payee = payee;
  rail.operator = operator;
  rail.token = token;
  rail.serviceFeeRecipient = serviceFeeRecipient;
  rail.commissionRateBps = commissionRateBps;
  rail.paymentRate = ZERO_BIG_INT;
  rail.lockupFixed = ZERO_BIG_INT;
  rail.lockupPeriod = ZERO_BIG_INT;
  rail.settledUpto = settledUpTo;
  rail.state = "ZERORATE";
  rail.endEpoch = ZERO_BIG_INT;
  rail.arbiter = arbiter;
  rail.totalSettledAmount = ZERO_BIG_INT;
  rail.totalNetPayeeAmount = ZERO_BIG_INT;
  rail.totalCommission = ZERO_BIG_INT;
  rail.totalSettlements = ZERO_BIG_INT;
  rail.totalRateChanges = ZERO_BIG_INT;
  rail.createdAt = timestamp;
  rail.save();

  return rail;
};

// RateChangeQueue entity functions
export const createRateChangeQueue = (
  rail: Rail,
  startEpoch: GraphBN,
  untilEpoch: GraphBN,
  rate: GraphBN,
): RateChangeQueueWithIsNew => {
  const id = getRateChangeQueueEntityId(rail.railId, startEpoch);
  let rateChangeQueue = RateChangeQueue.load(id);
  const isNew = !rateChangeQueue;

  if (!rateChangeQueue) {
    rateChangeQueue = new RateChangeQueue(id);
  }
  rateChangeQueue.rail = rail.id;
  rateChangeQueue.startEpoch = startEpoch;
  rateChangeQueue.untilEpoch = untilEpoch;
  rateChangeQueue.rate = rate;
  rateChangeQueue.save();

  return new RateChangeQueueWithIsNew(rateChangeQueue, isNew);
};

// Payments entity functions
export const createOrLoadPayments = (): PaymentsMetric => {
  const id = Bytes.fromUTF8("payments_network_stats");
  let payments = PaymentsMetric.load(id);

  if (payments) {
    return payments;
  }

  payments = new PaymentsMetric(id);
  payments.totalRails = ZERO_BIG_INT;
  payments.totalOperators = ZERO_BIG_INT;
  payments.totalAccounts = ZERO_BIG_INT;
  payments.totalTokens = ZERO_BIG_INT;
  payments.save();

  return payments;
};

export function updateOperatorLockup(
  operatorApproval: OperatorApproval | null,
  oldLockup: GraphBN,
  newLockup: GraphBN,
): void {
  if (!operatorApproval) {
    return;
  }

  operatorApproval.lockupUsage = operatorApproval.lockupUsage.minus(oldLockup).plus(newLockup);
  if (operatorApproval.lockupUsage.lt(ZERO_BIG_INT)) {
    operatorApproval.lockupUsage = ZERO_BIG_INT;
  }
  operatorApproval.save();
}

export function updateOperatorRate(
  operatorApproval: OperatorApproval | null,
  oldRate: GraphBN,
  newRate: GraphBN,
): void {
  if (!operatorApproval) {
    return;
  }

  operatorApproval.rateUsage = operatorApproval.rateUsage.minus(oldRate).plus(newRate);
  if (operatorApproval.rateUsage.lt(ZERO_BIG_INT)) {
    operatorApproval.rateUsage = ZERO_BIG_INT;
  }
}

export function updateOperatorTokenLockup(
  operatorToken: OperatorToken | null,
  oldLockup: GraphBN,
  newLockup: GraphBN,
): void {
  if (!operatorToken) {
    return;
  }

  operatorToken.lockupUsage = operatorToken.lockupUsage.minus(oldLockup).plus(newLockup);
  if (operatorToken.lockupUsage.lt(ZERO_BIG_INT)) {
    operatorToken.lockupUsage = ZERO_BIG_INT;
  }
  operatorToken.save();
}

export function updateOperatorTokenRate(operatorToken: OperatorToken | null, oldRate: GraphBN, newRate: GraphBN): void {
  if (!operatorToken) {
    return;
  }

  operatorToken.rateUsage = operatorToken.rateUsage.minus(oldRate).plus(newRate);
  if (operatorToken.rateUsage.lt(ZERO_BIG_INT)) {
    operatorToken.rateUsage = ZERO_BIG_INT;
  }
}
