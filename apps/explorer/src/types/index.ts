export type TransactionType =
  | "deposit"
  | "depositAndApprove"
  | "withdraw"
  | "approveOperator"
  | "increaseApproval"
  | "settleRail"
  | "terminateRail";

export interface TransactionMetadata {
  type: TransactionType;
  amount?: string;
  token?: string;
  operator?: string;
  railId?: string;
  recipient?: string;
  [key: string]: string | undefined;
}
