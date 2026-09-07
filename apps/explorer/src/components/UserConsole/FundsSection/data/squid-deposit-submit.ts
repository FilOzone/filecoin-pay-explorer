import type { Address } from "viem";

export type SquidDepositContextSnapshot = {
  owner: Address;
  recipient: Address;
  sourceChainId: number;
  sourceToken: Address;
  sourceAmount: bigint;
};

/** What the dialog currently shows, compared against the reviewed snapshot before every signature. */
export type SquidDepositLiveContext = {
  open: boolean;
  recipient?: string;
  owner?: string;
  chainId: number;
  token?: string;
  amount?: bigint;
};

export function assertSquidDepositContext(
  current: SquidDepositLiveContext,
  reviewed: SquidDepositContextSnapshot,
  liveRecipient: Address | undefined,
  mounted: boolean,
): void {
  if (
    !mounted ||
    !current.open ||
    liveRecipient?.toLowerCase() !== reviewed.recipient.toLowerCase() ||
    current.recipient?.toLowerCase() !== reviewed.recipient.toLowerCase() ||
    current.owner?.toLowerCase() !== reviewed.owner.toLowerCase() ||
    current.chainId !== reviewed.sourceChainId ||
    current.token?.toLowerCase() !== reviewed.sourceToken.toLowerCase() ||
    current.amount !== reviewed.sourceAmount
  ) {
    throw new Error("Funding details changed after review. Review the payment again.");
  }
}

export function claimSquidDepositSubmission(submitting: { current: boolean }): boolean {
  if (submitting.current) return false;
  submitting.current = true;
  return true;
}

export function releaseSquidDepositSubmission(submitting: { current: boolean }): void {
  submitting.current = false;
}
