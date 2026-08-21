import type { ReactNode } from "react";
import {
  calculateFundingRunway,
  DEFAULT_FUNDING_MONTHS,
  EPOCHS_PER_MONTH,
  FUNDING_ESTIMATE_DISCLAIMER,
  type FundingAccountSummary,
  type FundingRunway,
  type FundingStatus,
  formatFundedThrough,
  formatSuggestedTopUp,
  MAX_FUNDING_MONTHS,
  minTopUpMonths,
  monthsForTopUp,
} from "../data/funding-runway";
import { parseTopUpAmount } from "../data/guided-top-up";

// Shared by the guided top-up and deposit dialogs so the two funding surfaces
// cannot drift: one slider to pick an amount by runway duration, one card to
// show the resulting projection.

function formatMonths(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? "1 year" : `${years} years`;
  }
  return months === 1 ? "1 month" : `${months} months`;
}

const FUNDING_STATUS_LABELS: Record<FundingStatus, string> = {
  critical: "Critical",
  urgent: "Urgent",
  low: "Low",
  funded: "Funded",
  "long-term-funded": "Long-term funded",
  "no-active-spend": "No active spend",
};

type FundingRunwaySliderProps = {
  accountSummary: FundingAccountSummary;
  amount: string;
  disabled?: boolean;
  genesisTimestamp: number;
  maxAmount?: bigint;
  onSelect: (amount: string) => void;
};

// "Fund for" slider: drag a duration and the USDFC amount fills in; type an
// amount and the thumb tracks the runway it buys. The floor starts at the
// first month the account is not already funded through, so a covered target
// is never offered; the ceiling stops at what `maxAmount` can pay, so an
// unaffordable target is never offered either.
export function FundingRunwaySlider({
  accountSummary,
  amount,
  disabled = false,
  genesisTimestamp,
  maxAmount,
  onSelect,
}: FundingRunwaySliderProps) {
  const minMonths = minTopUpMonths(accountSummary);
  // No recurring spend to project, or already funded past the max target.
  if (minMonths === null) return null;
  const affordableMonths = maxAmount === undefined ? null : monthsForTopUp(accountSummary, maxAmount);
  const maxMonths =
    affordableMonths === null ? MAX_FUNDING_MONTHS : Math.min(MAX_FUNDING_MONTHS, Math.floor(affordableMonths));
  if (maxMonths < minMonths) return null;

  const parsed = parseTopUpAmount(amount);
  const exactMonths = parsed === null ? null : monthsForTopUp(accountSummary, parsed);
  const position =
    exactMonths === null
      ? Math.min(Math.max(DEFAULT_FUNDING_MONTHS, minMonths), maxMonths)
      : Math.min(Math.max(Math.round(exactMonths), minMonths), maxMonths);
  const label =
    exactMonths === null
      ? formatMonths(position)
      : // Half-month slack absorbs the round-UP in formatSuggestedTopUp, so a
        // slider-filled max target reads "~5 years", not "over 5 years".
        exactMonths > MAX_FUNDING_MONTHS + 0.5
        ? "over 5 years"
        : exactMonths < 1
          ? "less than a month"
          : `~${formatMonths(Math.min(Math.max(Math.round(exactMonths), 1), MAX_FUNDING_MONTHS))}`;

  return (
    <div className='grid gap-1'>
      <div className='flex items-center justify-between'>
        <span className='text-sm font-medium'>Fund for</span>
        <span className='text-sm font-medium'>{label}</span>
      </div>
      <input
        aria-label='Runway to fund, in months'
        className='w-full accent-primary'
        disabled={disabled}
        max={maxMonths}
        min={minMonths}
        onChange={(event) => {
          const months = BigInt(event.target.value);
          onSelect(
            formatSuggestedTopUp(
              calculateFundingRunway(accountSummary, months * EPOCHS_PER_MONTH, genesisTimestamp).suggestedTopUp,
            ),
          );
        }}
        step={1}
        type='range'
        value={position}
      />
      <div className='flex justify-between text-xs text-muted-foreground'>
        <span>{formatMonths(minMonths)}</span>
        <span>{formatMonths(maxMonths)}</span>
      </div>
    </div>
  );
}

type RunwayCardProps = {
  current: FundingRunway;
  projected: FundingRunway | null;
  children?: ReactNode;
};

export function RunwayCard({ children, current, projected }: RunwayCardProps) {
  return (
    <div className='grid gap-2 rounded-md border p-3 text-sm'>
      <p>
        Current funded through: <span className='font-medium'>{formatFundedThrough(current)}</span>{" "}
        <span className='text-muted-foreground'>({FUNDING_STATUS_LABELS[current.status]})</span>
      </p>
      <p>
        Projected funded through:{" "}
        <span className='font-medium'>{projected ? formatFundedThrough(projected, true) : "—"}</span>{" "}
        {projected ? <span className='text-muted-foreground'>({FUNDING_STATUS_LABELS[projected.status]})</span> : null}
      </p>
      {children}
      <p className='text-muted-foreground'>{FUNDING_ESTIMATE_DISCLAIMER}</p>
    </div>
  );
}
