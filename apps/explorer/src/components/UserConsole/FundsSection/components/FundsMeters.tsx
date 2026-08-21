import { Card } from "@filecoin-pay/ui/components/card";
import { maxUint256 } from "viem";
import { formatFutureTimestamp } from "@/utils/formatter";
import { formatDuration } from "../utils/formatDuration";
import { formatTokenAmount } from "../utils/formatTokenAmount";
import type { FundsHealth } from "../utils/fundsHealth";
import { getLockedPercent, getRunwayPercent } from "../utils/meterPercent";
import { TIER_BAR_CLASSNAME, TIER_TRACK_CLASSNAME, TIER_VALUE_CLASSNAME } from "../utils/tierStyles";
import MeterRow from "./MeterRow";

type FundsMetersProps = {
  /** Total deposited balance for the selected token. */
  funds: bigint;
  /** `simulatedLockupCurrent` — lockup rolled forward to `currentTimestamp`. */
  lockedAmount: bigint;
  tokenDecimals: bigint | number;
  tokenSymbol: string;
  fundedUntilTimestamp: bigint;
  currentTimestamp: bigint;
  health: FundsHealth;
};

const getRunwayLabel = ({ daysRemaining, isExpired }: FundsHealth): string => {
  if (isExpired) return "Expired";
  // The exact phrase the Funded until card uses for the same state.
  if (daysRemaining === null) return "No recurring charges";
  return formatDuration(daysRemaining);
};

/**
 * The date behind the runway bar, or nothing when there is no date to give:
 * an infinite runway has none, and an expired one would only echo the "Expired"
 * reading already shown at the right of the row.
 */
const getRunwayDetail = (fundedUntilTimestamp: bigint, currentTimestamp: bigint, health: FundsHealth) => {
  if (fundedUntilTimestamp === maxUint256 || health.isExpired) return undefined;
  return `Funded until ${formatFutureTimestamp(fundedUntilTimestamp, currentTimestamp)}`;
};

/**
 * The two proportional readings under the overview cards: how long the funds
 * last, and how much of them is already spoken for.
 *
 * Everything here is derived from figures the overview already computed, this
 * card reads no new data.
 */
const FundsMeters = ({
  funds,
  lockedAmount,
  tokenDecimals,
  tokenSymbol,
  fundedUntilTimestamp,
  currentTimestamp,
  health,
}: FundsMetersProps) => {
  const lockedPercent = getLockedPercent(lockedAmount, funds);

  return (
    <Card className='flex flex-col gap-4 p-4 sm:grid sm:grid-cols-[minmax(0,13rem)_1fr_auto] sm:items-center sm:gap-x-4 sm:gap-y-4'>
      <MeterRow
        label='Runway'
        detail={getRunwayDetail(fundedUntilTimestamp, currentTimestamp, health)}
        value={getRunwayLabel(health)}
        percent={getRunwayPercent(fundedUntilTimestamp, currentTimestamp)}
        fillClassName={TIER_BAR_CLASSNAME[health.tier]}
        trackClassName={TIER_TRACK_CLASSNAME[health.tier]}
        valueClassName={TIER_VALUE_CLASSNAME[health.tier]}
      />
      <MeterRow
        label='Locked of balance'
        detail={`${formatTokenAmount(lockedAmount, tokenDecimals)} of ${formatTokenAmount(funds, tokenDecimals)} ${tokenSymbol} reserved`}
        value={`${lockedPercent}% locked`}
        percent={lockedPercent}
        fillClassName='bg-[#2563EB] dark:bg-[#60A5FA]'
        trackClassName='bg-[#2563EB]/15 dark:bg-[#60A5FA]/20'
      />
    </Card>
  );
};

export default FundsMeters;
