import { Button } from "@filecoin-pay/ui/components/button";
import { Card } from "@filecoin-pay/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@filecoin-pay/ui/components/empty";
import { Skeleton } from "@filecoin-pay/ui/components/skeleton";
import { AlertCircle } from "lucide-react";
import usePayMetrics from "@/hooks/usePayMetrics";
import { formatCompactNumber, formatFIL } from "@/utils/formatter";
import { MetricItem } from "../shared";

const StatsLayout = ({ children }: { children: React.ReactNode }) => (
  <section className='flex flex-col gap-6'>
    <h1 className='text-2xl font-semibold'>Filecoin Pay Stats</h1>
    {children}
  </section>
);

const NetworkStatsSkeleton: React.FC = () => (
  <StatsLayout>
    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
      {[...Array(10)].map((_, i) => (
        <div key={i} className='p-4 border rounded-lg bg-card text-card-foreground shadow-sm'>
          <Skeleton className='h-4 w-3/4 mb-2' />
          <Skeleton className='h-8 w-1/2' />
        </div>
      ))}
    </div>
  </StatsLayout>
);

const ErrorState: React.FC<{ refetch: () => void; error: Error }> = ({ refetch, error }) => (
  <StatsLayout>
    <Card>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <AlertCircle />
          </EmptyMedia>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>{error ? error.message : "Failed to fetch data"}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={refetch}>Retry</Button>
        </EmptyContent>
      </Empty>
    </Card>
  </StatsLayout>
);

const Stats = () => {
  const { data, isLoading, isError, error, refetch } = usePayMetrics();

  const cards = [
    {
      title: "Total Rails",
      value: formatCompactNumber(data?.totalRails || 0),
    },
    {
      title: "Total Operators",
      value: formatCompactNumber(data?.totalOperators || 0),
    },
    {
      title: "Total Tokens",
      value: formatCompactNumber(data?.totalTokens || 0),
    },
    {
      title: "Unique Payers",
      value: formatCompactNumber(data?.uniquePayers || 0),
    },
    {
      title: "Unique Payees",
      value: formatCompactNumber(data?.uniquePayees || 0),
    },
    {
      title: "Total Fil Burned",
      value: formatFIL(data?.totalFilBurned || 0n),
    },
    {
      title: "Total Zero Rate Rails",
      value: formatCompactNumber(data?.totalZeroRateRails || 0),
    },
    {
      title: "Total Active Rails",
      value: formatCompactNumber(data?.totalActiveRails || 0),
    },
    {
      title: "Total Terminated Rails",
      value: formatCompactNumber(data?.totalTerminatedRails || 0),
    },
  ];

  if (isLoading) {
    return <NetworkStatsSkeleton />;
  }

  if (isError) {
    return <ErrorState refetch={refetch} error={error} />;
  }

  return (
    <StatsLayout>
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
        {cards.map((card) => (
          <MetricItem key={card.title} title={card.title} value={card.value?.toString() || "0"} />
        ))}
      </div>
    </StatsLayout>
  );
};

export default Stats;
