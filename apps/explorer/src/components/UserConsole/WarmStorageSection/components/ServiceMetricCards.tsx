"use client";

import { Card } from "@filecoin-pay/ui/components/card";
import { cn } from "@filecoin-pay/ui/lib/utils";
import type { MockDataset } from "../data/mockDatasets";
import { daysUntil, formatDate, formatUSD, isStale, wastedSpendUSD } from "../utils/datasetLifecycle";

const MetricCard = ({
  label,
  value,
  detail,
  detailClassName,
}: {
  label: string;
  value: string;
  detail?: string;
  detailClassName?: string;
}) => (
  <Card className='gap-1.5 p-4'>
    <p className='text-sm text-muted-foreground'>{label}</p>
    <p className='text-xl font-medium tabular-nums text-foreground'>{value}</p>
    {detail ? <p className={cn("text-xs text-muted-foreground", detailClassName)}>{detail}</p> : null}
  </Card>
);

export const ServiceMetricCards = ({ datasets }: { datasets: MockDataset[] }) => {
  const monthlySpend = datasets.reduce((sum, d) => sum + d.burnPerDayUSD * 30, 0);
  const locked = datasets.reduce((sum, d) => sum + d.lockedUSD, 0);
  const stale = datasets.filter(isStale);
  const staleMonthlySpend = stale.reduce((sum, d) => sum + d.burnPerDayUSD * 30, 0);
  const wasted = stale.reduce((sum, d) => sum + wastedSpendUSD(d), 0);
  const nextExpiring = [...datasets].sort((a, b) => daysUntil(a.fundedUntil) - daysUntil(b.fundedUntil))[0];

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      <MetricCard
        label='Warm Storage spend'
        value={`${formatUSD(monthlySpend)} / mo`}
        detail={`${datasets.length} datasets`}
      />
      <MetricCard
        label='Inactive spend'
        value={`${formatUSD(staleMonthlySpend)} / mo`}
        detail={
          stale.length > 0
            ? `${stale.length} inactive datasets, ${formatUSD(wasted)} spent since last activity`
            : "No inactive datasets"
        }
        detailClassName={stale.length > 0 ? "text-amber-500" : undefined}
      />
      <MetricCard label='Locked in deposits' value={formatUSD(locked)} detail='Refundable buffer, not a charge' />
      {nextExpiring ? (
        <MetricCard
          label='Next expiry'
          value={formatDate(nextExpiring.fundedUntil)}
          detail={`${nextExpiring.name} · ${daysUntil(nextExpiring.fundedUntil)} days`}
          detailClassName={daysUntil(nextExpiring.fundedUntil) <= 30 ? "text-amber-500" : undefined}
        />
      ) : null}
    </div>
  );
};
