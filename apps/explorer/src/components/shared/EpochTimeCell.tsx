"use client";

import { EpochTime } from "./EpochTime";

interface EpochTimeCellProps {
  epoch: bigint | number;
  currentEpoch: bigint | number | undefined;
  granularity?: "date" | "datetime";
  className?: string;
}

export function EpochTimeCell({ epoch, currentEpoch, granularity = "date", className }: EpochTimeCellProps) {
  if (currentEpoch === undefined) {
    return <span className={className}>Loading...</span>;
  }

  return (
    <EpochTime
      epoch={epoch}
      currentEpoch={currentEpoch}
      granularity={granularity}
      showTooltip={false}
      className={className}
    />
  );
}
