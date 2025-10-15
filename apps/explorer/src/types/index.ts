import type { Abi, Hex } from "viem";
import { supportedChains } from "@/services/wagmi/config";

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

export interface FaucetProvider {
  name: string;
  url: string;
}

export type ChainConstants = {
  chain: (typeof supportedChains)[number];
  label: string;
  contracts: {
    usdfc: Hex;
    payments: {
      address: Hex;
      abi: Abi;
    };
  };
  faucets?: FaucetProvider[];
};

export type AccountInfo = [bigint, bigint, bigint, bigint];
