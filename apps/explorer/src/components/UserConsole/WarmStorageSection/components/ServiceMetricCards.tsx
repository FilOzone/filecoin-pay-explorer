"use client";

import { Card } from "@filecoin-pay/ui/components/card";
import { cn } from "@filecoin-pay/ui/lib/utils";
import { MOCK_ACCOUNT, MOCK_NOW, type MockDataset } from "../data/mockDatasets";
import { formatDate, formatUSD, MS_PER_DAY } from "../utils/datasetLifecycle";

const RUNWAY_WARNING_DAYS = 30;

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
  const recurring = datasets.reduce((sum, d) => sum + d.burnPerDayUSD * 30, 0);
  const oneTimeOps = datasets.reduce((sum, d) => sum + d.oneTimeOpsUSD, 0);
  const locked = datasets.reduce((sum, d) => sum + d.lockedUSD, 0);

  // Runway is account-level: available funds against the total streaming rate,
  // shared across every service the account pays. There is no per-dataset runway.
  const dailyBurn = datasets.reduce((sum, d) => sum + d.burnPerDayUSD, 0);
  const runwayDays = dailyBurn > 0 ? Math.floor(MOCK_ACCOUNT.availableUSD / dailyBurn) : Number.POSITIVE_INFINITY;
  const runwayEnd = new Date(MOCK_NOW.getTime() + runwayDays * MS_PER_DAY);

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
      <MetricCard
        label='Spend / month'
        value={formatUSD(recurring + oneTimeOps)}
        detail={`${formatUSD(recurring)} recurring · ${formatUSD(oneTimeOps)} one-time ops · ${datasets.length} datasets`}
      />
      <MetricCard
        label='Runway'
        value={Number.isFinite(runwayDays) ? `${runwayDays} days` : "—"}
        detail={
          Number.isFinite(runwayDays)
            ? `Available funds cover current spend until ${formatDate(runwayEnd)} · account-level, shared across services`
            : "No streaming spend"
        }
        detailClassName={runwayDays <= RUNWAY_WARNING_DAYS ? "text-amber-500" : undefined}
      />
      <MetricCard
        label='Locked in deposits'
        value={formatUSD(locked)}
        detail='Returned to your available balance when datasets are terminated or rails settle — not spendable while locked'
      />
    </div>
  );
};
