import { PaymentsService, PDPVerifier, Synapse, type UploadResult, WarmStorageService } from "@filoz/synapse-sdk";

export interface IStorageCheck {
  rateAllowanceNeeded: bigint;
  lockupAllowanceNeeded: bigint;
  currentRateAllowance: bigint;
  currentLockupAllowance: bigint;
  currentRateUsed: bigint;
  currentLockupUsed: bigint;
  sufficient: boolean;
  message?: string;
  costs: {
    perEpoch: bigint;
    perDay: bigint;
    perMonth: bigint;
  };
  depositAmountNeeded: bigint;
}

export interface SynapseContextType {
  synapse: Synapse | null;
  paymentsService: PaymentsService | null;
  warmStorageService: WarmStorageService | null;
  pdpVerifier: PDPVerifier | null;
  checkStorageAllowance: (sizeInBytes: number, withCDN: boolean) => Promise<IStorageCheck | undefined>;
  uploadFile: (file: File) => Promise<UploadResult | undefined>;
}
