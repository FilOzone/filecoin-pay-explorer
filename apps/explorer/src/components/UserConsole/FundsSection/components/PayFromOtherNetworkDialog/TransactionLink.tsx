import { ExternalTextLink } from "@filecoin-foundation/ui-filecoin/TextLink/ExternalTextLink";
import type { Hash } from "viem";
import { getSquidScanTransactionUrl } from "../../data/squid-deposit-route";

/**
 * "View on Basescan" when the explorer is known (else the bare hash), and
 * "Track on Squid", whose explorer follows the route across the bridge.
 */
export function TransactionLink({
  explorerName,
  explorerUrl,
  hash,
}: {
  explorerName?: string;
  explorerUrl?: string;
  hash: Hash;
}) {
  return (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
      {explorerUrl ? (
        <ExternalTextLink className='text-xs' href={`${explorerUrl}/tx/${hash}`}>
          View on {explorerName ?? "the source network explorer"}
        </ExternalTextLink>
      ) : (
        <code className='block break-all'>{hash}</code>
      )}
      <ExternalTextLink className='text-xs' href={getSquidScanTransactionUrl(hash)}>
        Track on Squid
      </ExternalTextLink>
    </div>
  );
}
