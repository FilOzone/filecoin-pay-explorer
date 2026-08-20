import type { UserToken } from "@filecoin-pay/types";
import { AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { maxUint256 } from "viem";
import { formatFutureTimestamp } from "@/utils/formatter";
import { calculateFundedUntil } from "../utils/calculateFundedUntil";
import { formatTokenAmount } from "../utils/formatTokenAmount";
import { deriveFundsHealth, type HealthTier } from "../utils/fundsHealth";
import FundsMetricCard from "./FundsMetricCard";

type FundsOverviewProps = {
  userToken: UserToken;
  currentTimestamp: bigint;
};

/**
 * Tier colours are the deliberate exception to the semantic-token rule: they
 * encode severity, which no semantic token expresses. The icon and the
 * "in N days" detail carry the same information without relying on colour.
 *
 * Text runs two steps darker than the palette's fill hue.
 *
 * Dark mode keeps the light tints: there the same hues sit on a dark fill, where
 * a light value is the legible one.
 */
const TIER_VALUE_CLASSNAME: Record<HealthTier, string> = {
  healthy: "text-[#15803D] dark:text-[#4ADE80]",
  warning: "text-[#B45309] dark:text-[#FCD34D]",
  critical: "text-[#9A3412] dark:text-[#FDBA74]",
  emergency: "text-[#B91C1C] dark:text-[#FCA5A5]",
};

/**
 * Fills are the palette hues at partial alpha rather than lighter hex values, so
 * the tint stays the design's colour and its strength is one number to turn.
 *
 * No border override here on purpose: the card keeps the shared `border-border`
 * token, so it sits in the same frame as the other three.
 */
const TIER_CARD_CLASSNAME: Record<HealthTier, string> = {
  healthy: "bg-[#DCFCE7]/60 dark:bg-[#16A34A]/15",
  warning: "bg-[#FEF3C7]/60 dark:bg-[#F59E0B]/15",
  critical: "bg-[#FECAB5]/60 dark:bg-[#F97316]/15",
  emergency: "bg-[#FEE2E2]/60 dark:bg-[#DC2626]/15",
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
    <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
      <FundsMetricCard label='Balance' value={formatTokenAmount(userToken.funds, decimals)} detail='Total deposited' />
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
          TIERS_WITH_ICON.has(health.tier) ? <AlertCircle aria-hidden='true' className='size-4 shrink-0' /> : undefined
        }
      />
    </div>
  );
};

export default FundsOverview;
