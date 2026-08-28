"use client";

import { Card } from "@filecoin-pay/ui/components/card";
import { formatTokenTruncated } from "@/utils/formatter";
import type { ServiceRollup } from "@/utils/railRollup";

const MetricCard = ({ label, value, detail }: { label: string; value: string; detail?: string }) => (
  <Card className='gap-1.5 p-4'>
    <p className='text-sm text-muted-foreground'>{label}</p>
    <p className='text-xl font-medium tabular-nums text-foreground'>{value}</p>
    {detail ? <p className='text-xs text-muted-foreground'>{detail}</p> : null}
  </Card>
);

/**
 * Service-scoped money from real rails (this wallet as payer, this operator).
 * One-time fees are all-time — the subgraph rail carries a running total, not
 * a windowed one; the label says so rather than pretending it's monthly.
 */
export const ServiceMetricCards = ({ rollup }: { rollup: ServiceRollup | undefined }) => {
  const decimals = rollup?.tokenDecimals ?? 18;
  const symbol = rollup?.tokenSymbol || "USDFC";

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
      <MetricCard
        label='Spend / month — this service'
        value={formatTokenTruncated(rollup?.monthlyRate ?? 0n, decimals, symbol)}
        detail={`${rollup?.activeRailCount ?? 0} active rails (of ${rollup?.railCount ?? 0}) · ${formatTokenTruncated(
          rollup?.oneTimeTotal ?? 0n,
          decimals,
          symbol,
        )} one-time fees all-time`}
      />
      <MetricCard
        label='Locked for this service'
        value={formatTokenTruncated(rollup?.streamingLockup ?? 0n, decimals, symbol)}
        detail='Reserved for active rails — returned to your available balance when datasets are terminated or rails settle; not spendable while locked'
      />
    </div>
  );
};
