import { ExternalTextLink } from "@filecoin-foundation/ui-filecoin/TextLink/ExternalTextLink";
import type { Hash } from "viem";

/** "View on Basescan" when the explorer is known, otherwise the bare hash. */
export function TransactionLink({
  explorerName,
  explorerUrl,
  hash,
}: {
  explorerName?: string;
  explorerUrl?: string;
  hash: Hash;
}) {
  if (!explorerUrl) return <code className='block break-all text-xs'>{hash}</code>;
  return (
    <ExternalTextLink className='text-xs' href={`${explorerUrl}/tx/${hash}`}>
      View on {explorerName ?? "the source network explorer"}
    </ExternalTextLink>
  );
}
