export type TransactionType =
  | "deposit"
  | "depositAndApprove"
  | "withdraw"
  | "approveOperator"
  | "increaseApproval"
  | "settleRail"
  | "terminateRail"
  | "createSessionKey"
  | "authorizeSessionKey"
  | "revokeSessionKey";

export type Network = "calibration" | "mainnet";

export interface TransactionMetadata {
  type: TransactionType;
  amount?: string;
  token?: string;
  operator?: string;
  railId?: string;
  recipient?: string;
  [key: string]: string | undefined;
}

export interface FaucetProvider {
  name: string;
  url: string;
  asset: "FIL" | "USDFC";
}

export type AccountInfo = [bigint, bigint, bigint, bigint];
