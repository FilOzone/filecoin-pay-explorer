import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Loader2 } from "lucide-react";
import { formatUnits } from "viem";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import type { PendingSquidDeposit } from "../data/squid-deposit-tracker";

/** "25 USDC from Base", or just the network when the token details were not recorded. */
export function describePendingDeposit(pending: PendingSquidDeposit): string {
  const network = SQUID_SOURCE_CHAINS.find((chain) => chain.id === pending.sourceChainId)?.name ?? "the source network";
  if (pending.sourceDecimals === undefined) return `USDC from ${network}`;
  const [whole, fraction = ""] = formatUnits(pending.sourceAmount, pending.sourceDecimals).split(".");
  const decimals = fraction.replace(/0+$/, "").slice(0, 2);
  return `${decimals ? `${whole}.${decimals}` : whole} ${pending.sourceSymbol ?? "USDC"} from ${network}`;
}

export function PendingDepositBanner({ onView, pending }: { onView: () => void; pending: PendingSquidDeposit }) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4' role='status'>
      <div className='flex items-start gap-3'>
        <Loader2 aria-hidden className='mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground' />
        <div>
          <p className='font-medium'>Deposit in progress</p>
          <p className='text-sm text-muted-foreground'>
            {`${describePendingDeposit(pending)} is on its way to your Filecoin Pay account.`}
          </p>
        </div>
      </div>
      <Button aria-label='View deposit in progress' onClick={onView} size='compact' type='button' variant='tertiary'>
        View
      </Button>
    </div>
  );
}
