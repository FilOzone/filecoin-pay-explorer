import { AlertCircle } from "lucide-react";
import { formatUnits } from "viem";
import { formatUsdfcAmount } from "../../data/funding-runway";
import {
  FIL_GAS_TOP_UP_AMOUNT,
  type FilGasTopUp,
  getDepositAfterFilGasTopUp,
  isUnfavorableRate,
  type SquidDepositQuote,
} from "../../data/squid-deposit-route";
import { isStablecoinSymbol } from "../../data/squid-payment-tokens";

const formatRate = (rate: number) =>
  rate.toLocaleString(undefined, { maximumFractionDigits: rate >= 100 ? 0 : rate >= 10 ? 2 : 3 });

/** What the account receives for the typed amount, with the rate, fees and time. */
export function QuoteSummary({
  filGasTopUp,
  quote,
  rate,
  tokenSymbol,
}: {
  /** The FIL top-up the user kept on, if any. */
  filGasTopUp?: FilGasTopUp;
  quote: SquidDepositQuote;
  rate: number;
  tokenSymbol: string;
}) {
  return (
    <div className='grid gap-1 rounded-md border p-3'>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-muted-foreground'>You receive at least</span>
        <span className='font-medium'>
          {formatUsdfcAmount(getDepositAfterFilGasTopUp(quote.minimumDestinationAmount, filGasTopUp))} USDFC
        </span>
      </div>
      {filGasTopUp && (
        <div className='flex items-center justify-between gap-2 text-xs text-muted-foreground'>
          <span>Plus about {formatUnits(FIL_GAS_TOP_UP_AMOUNT, 18)} FIL in your wallet for gas</span>
          <span>{formatUsdfcAmount(filGasTopUp.spendUsdfc)} USDFC</span>
        </div>
      )}
      <div className='flex items-center justify-between gap-2 text-xs text-muted-foreground'>
        <span>
          1 {tokenSymbol} ≈ {formatRate(rate)} USDFC
          {quote.priceImpactPercent ? ` · impact ${quote.priceImpactPercent}%` : ""}
        </span>
        <span>
          {quote.fees.length > 0
            ? `fees ${quote.fees.map((fee) => (fee.amountUsd ? `$${fee.amountUsd}` : fee.name)).join(" + ")}`
            : "no route fees"}
          {quote.estimatedSeconds !== undefined
            ? ` · ~${Math.max(1, Math.round(quote.estimatedSeconds / 60))} min`
            : ""}
        </span>
      </div>
      {/* Only a dollar-pegged token has a rate to fall short of. */}
      {isStablecoinSymbol(tokenSymbol) && isUnfavorableRate(rate) && (
        <p className='mt-1 inline-flex items-start gap-2 text-muted-foreground'>
          <AlertCircle aria-hidden className='mt-0.5 h-4 w-4 shrink-0' />
          <span>
            This route returns noticeably less than 1 USDFC per {tokenSymbol}. Continue only if the rate is acceptable.
          </span>
        </p>
      )}
    </div>
  );
}
