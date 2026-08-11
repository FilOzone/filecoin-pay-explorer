import type { ReactNode } from "react";
import { formatDate } from "@/utils/formatter";
import { calculateFundingRunway, type FundingPosition, type FundingStatus } from "../data/funding-runway";
import { calculateProjectedFundingRunway } from "../data/guided-top-up";

// Shared vocabulary for every surface that explains the runway numbers. The math is
// rate-based only (account lockup rate): one-time payments never enter it, so the
// dates are approximate and the copy says so.
export const RUNWAY_RATE_DISCLAIMER =
  "Estimates assume your current recurring spend rate; one-time charges aren't included.";
export const SUGGESTED_CHIP_CAPTION = "keeps this account funded for about a year at your current recurring spend rate";

type RunwayCardProps = {
  position: FundingPosition;
  depositAmount: bigint | null;
  nowTimestamp: bigint;
  children?: ReactNode;
};

function fundedThroughLabel(timestamp: bigint | null, status: FundingStatus, nowTimestamp: bigint) {
  if (timestamp === null) return status === "critical" ? "Underfunded" : "No active spend";
  // "~" because the date is a rate-only projection; see RUNWAY_RATE_DISCLAIMER.
  return timestamp <= nowTimestamp ? "Underfunded" : `~${formatDate(timestamp)}`;
}

export function RunwayCard({ position, depositAmount, nowTimestamp, children }: RunwayCardProps) {
  const current = calculateFundingRunway(position, nowTimestamp);
  const projected =
    depositAmount === null ? null : calculateProjectedFundingRunway(position, depositAmount, nowTimestamp);

  return (
    <div className='grid gap-2 rounded-md border p-3 text-sm'>
      <p>
        Current funded through:{" "}
        <span className='font-medium'>
          {fundedThroughLabel(current.fundedThroughTimestamp, current.status, nowTimestamp)}
        </span>
      </p>
      <p>
        Projected funded through:{" "}
        <span className='font-medium'>
          {projected ? fundedThroughLabel(projected.fundedThroughTimestamp, projected.status, nowTimestamp) : "—"}
        </span>
      </p>
      {children}
      <p className='text-xs text-muted-foreground'>{RUNWAY_RATE_DISCLAIMER}</p>
    </div>
  );
}
