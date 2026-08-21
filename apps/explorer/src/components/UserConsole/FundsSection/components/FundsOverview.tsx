import type { UserToken } from "@filecoin-pay/types";
import { AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { maxUint256 } from "viem";
import { formatFutureTimestamp } from "@/utils/formatter";
import { calculateFundedUntil } from "../utils/calculateFundedUntil";
import { formatTokenAmount } from "../utils/formatTokenAmount";
import { deriveFundsHealth, type HealthTier } from "../utils/fundsHealth";
import { TIER_CARD_CLASSNAME, TIER_VALUE_CLASSNAME } from "../utils/tierStyles";
import FundsMeters from "./FundsMeters";
import FundsMetricCard from "./FundsMetricCard";

type FundsOverviewProps = {
  userToken: UserToken;
  currentTimestamp: bigint;
};

const TIERS_WITH_ICON: ReadonlySet<HealthTier> = new Set<HealthTier>(["warning", "critical", "emergency"]);

const formatFundedUntil = (fundedUntilTimestamp: bigint, currentTimestamp: bigint) => {
  if (fundedUntilTimestamp === maxUint256) return "Infinity";
  return formatFutureTimestamp(fundedUntilTimestamp, currentTimestamp);
};

const formatRunwayDetail = (daysRemaining: number | null, isExpired: boolean) => {
  if (isExpired) return "Funding expired";
  // Infinite runway means no rate is charging the account — it does not mean nothing
  // is locked. Fixed lockup (a CDN rail, say) still shows on the Locked card, so this
  // must not read as "no lockup". Scoped to *recurring* so it stays true if a fixed
  // lockup is later settled as a one-off payment. Avoid "burn": in this product that
  // already means FIL destroyed for fees (`filBurned`), not paid to a provider.
  if (daysRemaining === null) return "No recurring charges";
  if (daysRemaining === 0) return "in less than a day";
  if (daysRemaining === 1) return "in 1 day";
  return `in ${daysRemaining} days`;
};

const FundsOverview = ({ userToken, currentTimestamp }: FundsOverviewProps) => {
  const { token } = userToken;

  const { availableFunds, debt, fundedUntilTimestamp, simulatedLockupCurrent } = useMemo(
    () => calculateFundedUntil(userToken, currentTimestamp),
    [userToken, currentTimestamp],
  );

  const health = useMemo(
    () => deriveFundsHealth(fundedUntilTimestamp, currentTimestamp),
    [fundedUntilTimestamp, currentTimestamp],
  );

  const isInDebt = debt > 0n;
  const decimals = token.decimals;

  return (
    // The meters read the same figures as the cards, so they live under the same
    // `calculateFundedUntil` call rather than repeating it a component away.
    <div className='flex flex-col gap-4'>
      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        <FundsMetricCard
          label='Balance'
          value={formatTokenAmount(userToken.funds, decimals)}
          detail='Total deposited'
        />
        <FundsMetricCard
          label='Locked'
          value={formatTokenAmount(simulatedLockupCurrent, decimals)}
          detail='Reserved for active services'
        />
        {/* Debt rounds up so the figure never flatters what is owed; balances truncate. */}
        <FundsMetricCard
          label='Available'
          value={isInDebt ? `-${formatTokenAmount(debt, decimals, "up")}` : formatTokenAmount(availableFunds, decimals)}
          detail={isInDebt ? "Outstanding debt" : "Withdrawable"}
          valueClassName={isInDebt ? TIER_VALUE_CLASSNAME.emergency : undefined}
        />
        <FundsMetricCard
          label='Funded until'
          value={formatFundedUntil(fundedUntilTimestamp, currentTimestamp)}
          detail={formatRunwayDetail(health.daysRemaining, health.isExpired)}
          className={TIER_CARD_CLASSNAME[health.tier]}
          valueClassName={TIER_VALUE_CLASSNAME[health.tier]}
          detailClassName={TIER_VALUE_CLASSNAME[health.tier]}
          icon={
            TIERS_WITH_ICON.has(health.tier) ? (
              <AlertCircle aria-hidden='true' className='size-4 shrink-0' />
            ) : undefined
          }
        />
      </div>

      <FundsMeters
        funds={BigInt(userToken.funds)}
        lockedAmount={simulatedLockupCurrent}
        tokenDecimals={decimals}
        tokenSymbol={token.symbol}
        fundedUntilTimestamp={fundedUntilTimestamp}
        currentTimestamp={currentTimestamp}
        health={health}
      />
    </div>
  );
};

export default FundsOverview;
