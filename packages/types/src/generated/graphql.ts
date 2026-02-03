import { BigInt, Bytes } from "../index.js";
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  BigInt: { input: BigInt; output: BigInt };
  Bytes: { input: Bytes; output: Bytes };
};

export type Account = {
  __typename: "Account";
  address: Scalars["Bytes"]["output"];
  id: Scalars["Bytes"]["output"];
  operatorApprovals: Array<OperatorApproval>;
  payeeRails: Array<Rail>;
  payerRails: Array<Rail>;
  totalApprovals: Scalars["BigInt"]["output"];
  totalRails: Scalars["BigInt"]["output"];
  totalTokens: Scalars["BigInt"]["output"];
  userTokens: Array<UserToken>;
};

export type DailyMetric = {
  __typename: "DailyMetric";
  activeRailsCount: Scalars["BigInt"]["output"];
  date: Scalars["String"]["output"];
  filBurned: Scalars["BigInt"]["output"];
  id: Scalars["Bytes"]["output"];
  railsCreated: Scalars["BigInt"]["output"];
  railsFinalized: Scalars["BigInt"]["output"];
  railsTerminated: Scalars["BigInt"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  totalRailSettlements: Scalars["BigInt"]["output"];
  uniqueAccounts: Scalars["BigInt"]["output"];
  uniqueOperators: Scalars["BigInt"]["output"];
  uniquePayees: Scalars["BigInt"]["output"];
  uniquePayers: Scalars["BigInt"]["output"];
};

export type DailyOperatorMetric = {
  __typename: "DailyOperatorMetric";
  date: Scalars["String"]["output"];
  id: Scalars["Bytes"]["output"];
  operator: Operator;
  railsCreated: Scalars["BigInt"]["output"];
  settlementsProcessed: Scalars["BigInt"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  totalApprovals: Scalars["BigInt"]["output"];
  uniqueClients: Scalars["BigInt"]["output"];
};

export type DailyTokenMetric = {
  __typename: "DailyTokenMetric";
  activeRailsCount: Scalars["BigInt"]["output"];
  commissionPaid: Scalars["BigInt"]["output"];
  date: Scalars["String"]["output"];
  deposit: Scalars["BigInt"]["output"];
  id: Scalars["Bytes"]["output"];
  oneTimePaymentAmount: Scalars["BigInt"]["output"];
  settledAmount: Scalars["BigInt"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  token: Token;
  totalLocked: Scalars["BigInt"]["output"];
  uniqueHolders: Scalars["BigInt"]["output"];
  volume: Scalars["BigInt"]["output"];
  withdrawal: Scalars["BigInt"]["output"];
};

export type OneTimePayment = {
  __typename: "OneTimePayment";
  blockNumber: Scalars["BigInt"]["output"];
  createdAt: Scalars["BigInt"]["output"];
  id: Scalars["Bytes"]["output"];
  netPayeeAmount: Scalars["BigInt"]["output"];
  networkFee: Scalars["BigInt"]["output"];
  operatorCommission: Scalars["BigInt"]["output"];
  rail: Rail;
  totalAmount: Scalars["BigInt"]["output"];
  txHash: Scalars["Bytes"]["output"];
};

export type Operator = {
  __typename: "Operator";
  address: Scalars["Bytes"]["output"];
  id: Scalars["Bytes"]["output"];
  operatorApprovals: Array<OperatorApproval>;
  operatorTokens: Array<OperatorToken>;
  rails: Array<Rail>;
  totalApprovals: Scalars["BigInt"]["output"];
  totalRails: Scalars["BigInt"]["output"];
  totalTokens: Scalars["BigInt"]["output"];
};

export type OperatorApproval = {
  __typename: "OperatorApproval";
  client: Account;
  id: Scalars["Bytes"]["output"];
  isApproved: Scalars["Boolean"]["output"];
  lockupAllowance: Scalars["BigInt"]["output"];
  lockupUsage: Scalars["BigInt"]["output"];
  maxLockupPeriod: Scalars["BigInt"]["output"];
  operator: Operator;
  rateAllowance: Scalars["BigInt"]["output"];
  rateUsage: Scalars["BigInt"]["output"];
  token: Token;
};

export type OperatorToken = {
  __typename: "OperatorToken";
  commissionEarned: Scalars["BigInt"]["output"];
  id: Scalars["Bytes"]["output"];
  lockupAllowance: Scalars["BigInt"]["output"];
  lockupUsage: Scalars["BigInt"]["output"];
  oneTimePaymentAmount: Scalars["BigInt"]["output"];
  operator: Operator;
  rateAllowance: Scalars["BigInt"]["output"];
  rateUsage: Scalars["BigInt"]["output"];
  settledAmount: Scalars["BigInt"]["output"];
  token: Token;
  volume: Scalars["BigInt"]["output"];
};

export type PaymentsMetric = {
  __typename: "PaymentsMetric";
  id: Scalars["Bytes"]["output"];
  totalAccounts: Scalars["BigInt"]["output"];
  totalActiveRails: Scalars["BigInt"]["output"];
  totalFilBurned: Scalars["BigInt"]["output"];
  totalFinalizedRails: Scalars["BigInt"]["output"];
  totalOperators: Scalars["BigInt"]["output"];
  totalRailSettlements: Scalars["BigInt"]["output"];
  totalRails: Scalars["BigInt"]["output"];
  totalTerminatedRails: Scalars["BigInt"]["output"];
  totalTokens: Scalars["BigInt"]["output"];
  totalZeroRateRails: Scalars["BigInt"]["output"];
  uniquePayees: Scalars["BigInt"]["output"];
  uniquePayers: Scalars["BigInt"]["output"];
};

export type Rail = {
  __typename: "Rail";
  arbiter: Scalars["Bytes"]["output"];
  commissionRateBps: Scalars["BigInt"]["output"];
  createdAt: Scalars["BigInt"]["output"];
  endEpoch: Scalars["BigInt"]["output"];
  id: Scalars["Bytes"]["output"];
  lockupFixed: Scalars["BigInt"]["output"];
  lockupPeriod: Scalars["BigInt"]["output"];
  oneTimePayments: Array<OneTimePayment>;
  operator: Operator;
  payee: Account;
  payer: Account;
  paymentRate: Scalars["BigInt"]["output"];
  railId: Scalars["BigInt"]["output"];
  rateChangeQueue: Array<RateChangeQueue>;
  serviceFeeRecipient: Scalars["Bytes"]["output"];
  settledUpto: Scalars["BigInt"]["output"];
  settlements: Array<Settlement>;
  state: RailState;
  token: Token;
  totalOneTimePaymentAmount: Scalars["BigInt"]["output"];
  totalOneTimePayments: Scalars["BigInt"]["output"];
  totalRateChanges: Scalars["BigInt"]["output"];
  totalSettledAmount: Scalars["BigInt"]["output"];
  totalSettlements: Scalars["BigInt"]["output"];
};

export type RailState = "ACTIVE" | "FINALIZED" | "TERMINATED" | "ZERORATE" | "%future added value";

export type RateChangeQueue = {
  __typename: "RateChangeQueue";
  id: Scalars["Bytes"]["output"];
  rail: Rail;
  rate: Scalars["BigInt"]["output"];
  startEpoch: Scalars["BigInt"]["output"];
  untilEpoch: Scalars["BigInt"]["output"];
};

export type Settlement = {
  __typename: "Settlement";
  blockNumber: Scalars["BigInt"]["output"];
  createdAt: Scalars["BigInt"]["output"];
  id: Scalars["Bytes"]["output"];
  networkFee: Scalars["BigInt"]["output"];
  operatorCommission: Scalars["BigInt"]["output"];
  rail: Rail;
  settledUpto: Scalars["BigInt"]["output"];
  totalNetPayeeAmount: Scalars["BigInt"]["output"];
  totalSettledAmount: Scalars["BigInt"]["output"];
  txHash: Scalars["Bytes"]["output"];
};

export type Token = {
  __typename: "Token";
  decimals: Scalars["BigInt"]["output"];
  id: Scalars["Bytes"]["output"];
  name: Scalars["String"]["output"];
  operatorCommission: Scalars["BigInt"]["output"];
  symbol: Scalars["String"]["output"];
  totalDeposits: Scalars["BigInt"]["output"];
  totalOneTimePayment: Scalars["BigInt"]["output"];
  totalSettledAmount: Scalars["BigInt"]["output"];
  totalUsers: Scalars["BigInt"]["output"];
  totalWithdrawals: Scalars["BigInt"]["output"];
  userFunds: Scalars["BigInt"]["output"];
  userTokens: Array<UserToken>;
  volume: Scalars["BigInt"]["output"];
};

export type UserToken = {
  __typename: "UserToken";
  account: Account;
  funds: Scalars["BigInt"]["output"];
  fundsCollected: Scalars["BigInt"]["output"];
  id: Scalars["Bytes"]["output"];
  lockupCurrent: Scalars["BigInt"]["output"];
  lockupLastSettledUntilEpoch: Scalars["BigInt"]["output"];
  lockupLastSettledUntilTimestamp: Scalars["BigInt"]["output"];
  lockupRate: Scalars["BigInt"]["output"];
  payout: Scalars["BigInt"]["output"];
  token: Token;
};

export type WeeklyMetric = {
  __typename: "WeeklyMetric";
  activeRailsCount: Scalars["BigInt"]["output"];
  filBurned: Scalars["BigInt"]["output"];
  id: Scalars["Bytes"]["output"];
  railsCreated: Scalars["BigInt"]["output"];
  railsFinalized: Scalars["BigInt"]["output"];
  railsTerminated: Scalars["BigInt"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  totalRailSettlements: Scalars["BigInt"]["output"];
  uniqueAccounts: Scalars["BigInt"]["output"];
  uniqueOperators: Scalars["BigInt"]["output"];
  uniquePayees: Scalars["BigInt"]["output"];
  uniquePayers: Scalars["BigInt"]["output"];
  week: Scalars["BigInt"]["output"];
};
