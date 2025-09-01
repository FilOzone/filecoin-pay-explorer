/* eslint-disable no-underscore-dangle */
import { Address, Bytes, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { erc20 } from "../../generated/Payments/erc20";

import {
  Account,
  Operator,
  OperatorApproval,
  PaymentsMetric,
  Rail,
  RateChangeQueue,
  Token,
  UserToken,
} from "../../generated/schema";
import { DEFAULT_DECIMALS } from "./constants";
import { ZERO_BIG_INT } from "./metrics";
import {
  getOperatorApprovalEntityId,
  getRailEntityId,
  getRateChangeQueueEntityId,
  getSettlementEntityId,
  getUserTokenEntityId,
} from "./keys";

class TokenDetails {
  token: Token;
  isNew: boolean;

  constructor(token: Token, isNew: boolean) {
    this.token = token;
    this.isNew = isNew;
  }
}

class AccountWithIsNew {
  account: Account;
  isNew: boolean;

  constructor(account: Account, isNew: boolean) {
    this.account = account;
    this.isNew = isNew;
  }
}

class UserTokenWithIsNew {
  userToken: UserToken;
  isNew: boolean;

  constructor(userToken: UserToken, isNew: boolean) {
    this.userToken = userToken;
    this.isNew = isNew;
  }
}

class OperatorWithIsNew {
  operator: Operator;
  isNew: boolean;

  constructor(operator: Operator, isNew: boolean) {
    this.operator = operator;
    this.isNew = isNew;
  }
}

// Alternative Account entity function for payments-related code
export const createOrLoadAccountByAddress = (address: Address): AccountWithIsNew => {
  let account = Account.load(address);

  if (!account) {
    account = new Account(address);
    account.address = address;
    account.totalRails = GraphBN.zero();
    account.totalApprovals = GraphBN.zero();
    account.totalTokens = GraphBN.zero();
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
    token.totalTokens = ZERO_BIG_INT;

    return new TokenDetails(token, true);
  }

  return new TokenDetails(token, false);
};

// UserToken entity functions
export const createOrLoadUserToken = (account: Account, token: Token): UserTokenWithIsNew => {
  const id = getUserTokenEntityId(account.id, token.id);
  let userToken = UserToken.load(id);
  if (!userToken) {
    userToken = new UserToken(id);
    userToken.account = account.id;
    userToken.token = token.id;
    userToken.funds = GraphBN.zero();
    userToken.lockupCurrent = GraphBN.zero();
    userToken.lockupRate = GraphBN.zero();
    userToken.lockupLastSettledAt = GraphBN.zero();
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
    operator.totalRails = GraphBN.zero();
    operator.totalApprovals = GraphBN.zero();
    operator.save();
    return new OperatorWithIsNew(operator, true);
  }

  return new OperatorWithIsNew(operator, false);
};

// OperatorApproval entity functions
export const createOperatorApproval = (
  client: Account,
  operator: Operator,
  token: Token,
  lockupAllowance: GraphBN,
  rateAllowance: GraphBN,
): OperatorApproval => {
  const id = getOperatorApprovalEntityId(client.id, operator.id, token.id);
  const operatorApproval = new OperatorApproval(id);
  operatorApproval.client = client.id;
  operatorApproval.operator = operator.id;
  operatorApproval.token = token.id;
  operatorApproval.lockupAllowance = lockupAllowance;
  operatorApproval.lockupUsage = GraphBN.zero();
  operatorApproval.rateAllowance = rateAllowance;
  operatorApproval.rateUsage = GraphBN.zero();
  operatorApproval.save();

  return operatorApproval;
};

// Rail entity functions
export const createRail = (
  railId: GraphBN,
  payer: Account,
  payee: Account,
  operator: Operator,
  token: Address,
  arbiter: Address,
  settledUpTo: GraphBN,
  commissionRateBps: GraphBN,
  serviceFeeRecipient: Address,
  blockNumber: GraphBN,
): Rail => {
  const rail = new Rail(getRailEntityId(railId));
  rail.railId = railId;
  rail.payer = payer.id;
  rail.payee = payee.id;
  rail.operator = operator.id;
  rail.token = token;
  rail.serviceFeeRecipient = serviceFeeRecipient;
  rail.commissionRateBps = commissionRateBps;
  rail.paymentRate = GraphBN.zero();
  rail.lockupFixed = GraphBN.zero();
  rail.lockupPeriod = GraphBN.zero();
  rail.settledUpto = settledUpTo;
  rail.state = "ZERORATE";
  rail.endEpoch = GraphBN.zero();
  rail.arbiter = arbiter;
  rail.totalSettledAmount = GraphBN.zero();
  rail.totalNetPayeeAmount = GraphBN.zero();
  rail.totalCommission = GraphBN.zero();
  rail.totalSettlements = GraphBN.zero();
  rail.totalRateChanges = GraphBN.zero();
  rail.createdAt = blockNumber;
  rail.save();

  return rail;
};

// RateChangeQueue entity functions
export const createRateChangeQueue = (
  rail: Rail,
  startEpoch: GraphBN,
  untilEpoch: GraphBN,
  rate: GraphBN,
): RateChangeQueue => {
  const id = getRateChangeQueueEntityId(rail.railId, startEpoch);
  const rateChangeQueue = new RateChangeQueue(id);
  rateChangeQueue.rail = rail.id;
  rateChangeQueue.startEpoch = startEpoch;
  rateChangeQueue.untilEpoch = untilEpoch;
  rateChangeQueue.rate = rate;
  rateChangeQueue.save();

  return rateChangeQueue;
};

// Payments entity functions
export const createOrLoadPayments = (): PaymentsMetric => {
  const id = Bytes.fromUTF8("payments_network_stats");
  let payments = PaymentsMetric.load(id);

  if (payments) {
    return payments;
  }

  payments = new PaymentsMetric(id);
  payments.totalRails = GraphBN.zero();
  payments.totalOperators = GraphBN.zero();
  payments.totalAccounts = GraphBN.zero();
  payments.totalTokens = GraphBN.zero();
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
  if (operatorApproval.lockupUsage.lt(GraphBN.zero())) {
    operatorApproval.lockupUsage = GraphBN.zero();
  }
  operatorApproval.save();
}
