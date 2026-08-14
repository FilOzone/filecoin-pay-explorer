import type { UserToken } from "@filecoin-pay/types";
import { AlertCircle } from "lucide-react";
import { EPOCH_DURATION, FUNDING_WARNING_THRESHOLD_SECONDS } from "@/utils/constants";
import { formatFutureTimestamp, formatToken } from "@/utils/formatter";

interface FundsOverviewCardsProps {
  userToken: UserToken;
}

function calculateFundedUntil(userToken: UserToken) {
  const availableFunds = BigInt(userToken.funds) - BigInt(userToken.lockupCurrent);
  const lockupRate = BigInt(userToken.lockupRate);
  const fundedUntil = availableFunds > 0n && lockupRate > 0n ? availableFunds / lockupRate : 0n;
  const fundedUntilTimestamp = BigInt(userToken.lockupLastSettledUntilTimestamp) + fundedUntil * BigInt(EPOCH_DURATION);

  const isInfinity = lockupRate === 0n;
  const fundedUntilTime = isInfinity ? "Infinity" : formatFutureTimestamp(Number(fundedUntilTimestamp));
  const isExpired = !isInfinity && fundedUntilTime === "Expired";
  const timeUntilExpiry = Number(fundedUntilTimestamp) - Date.now() / 1000;
  const isWarning =
    !isInfinity && !isExpired && timeUntilExpiry > 0 && timeUntilExpiry <= FUNDING_WARNING_THRESHOLD_SECONDS;
  const daysRemaining = isInfinity || isExpired ? null : Math.ceil(timeUntilExpiry / 86400);

  return { availableFunds, fundedUntilTime, isInfinity, isExpired, isWarning, daysRemaining };
}

export function FundsOverviewCards({ userToken }: FundsOverviewCardsProps) {
  const { availableFunds, fundedUntilTime, isExpired, isWarning, daysRemaining } = calculateFundedUntil(userToken);

  const { symbol, decimals } = userToken.token;

  const fundedUntilCardBg = isExpired ? "bg-red-50" : isWarning ? "bg-amber-50" : "bg-green-50";
  const timeColor = isExpired ? "text-red-600" : isWarning ? "text-amber-600" : "text-green-600";
  const subtitleColor = isExpired ? "text-red-400" : isWarning ? "text-amber-500" : "text-green-600";

  return (
    <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
      <StatCard label='Balance' value={formatToken(userToken.funds, decimals, "", 3)} subtitle={symbol} />
      <StatCard label='Locked' value={formatToken(userToken.lockupCurrent, decimals, "", 3)} subtitle='reserved' />
      <StatCard
        label='Available'
        value={formatToken(availableFunds.toString(), decimals, "", 3)}
        subtitle='withdrawable'
      />
      <div className={`rounded-xl border p-5 ${fundedUntilCardBg}`}>
        <p className='text-sm text-zinc-500'>Funded until</p>
        <div className={`mt-2 flex items-center gap-1.5 text-2xl font-bold ${timeColor}`}>
          {isWarning && <AlertCircle className='size-5 shrink-0' />}
          {fundedUntilTime}
        </div>
        {daysRemaining !== null && <p className={`mt-1 text-sm ${subtitleColor}`}>in {daysRemaining} days</p>}
      </div>
    </div>
  );
}

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle: string }) {
  return (
    <div className='rounded-xl border bg-white p-5'>
      <p className='text-sm text-zinc-500'>{label}</p>
      <p className='mt-2 text-2xl font-bold text-zinc-900'>{value}</p>
      <p className='mt-1 text-sm text-zinc-500'>{subtitle}</p>
    </div>
  );
}
