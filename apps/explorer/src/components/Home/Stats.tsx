"use client";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
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
  <PageSection backgroundVariant='light' paddingVariant='medium'>
    <div className='flex flex-col gap-6 -mt-15'>
      <h3 className='text-2xl font-medium'>Filecoin Pay Stats</h3>
      {children}
    </div>
  </PageSection>
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
      title: "Unique Payers",
      value: formatCompactNumber(data?.uniquePayers || 0),
      icon: "/stats/unique-payers.svg",
    },
    {
      title: "Unique Payees",
      value: formatCompactNumber(data?.uniquePayees || 0),
      icon: "/stats/unique-payees.svg",
    },
    {
      title: "Total Rails",
      value: formatCompactNumber(data?.totalRails || 0),
      icon: "/stats/total-rails.svg",
      tooltip: "Ongoing payment streams between users",
    },
    {
      title: "Total Services",
      value: formatCompactNumber(data?.totalOperators || 0),
      icon: "/stats/total-services.svg",
      tooltip: "Payment managers that help automate transactions between users",
    },
    {
      title: "Total Fil Burned",
      value: formatFIL(data?.totalFilBurned || "0"),
      icon: "/stats/total-fil-burned.svg",
      tooltip: "Network fees paid to process payment settlements",
    },
    {
      title: "Total Idle Rails",
      value: formatCompactNumber(data?.totalZeroRateRails || 0),
      icon: "/stats/idle-rails.svg",
      tooltip: "Paused payment streams that are currently inactive",
    },
    {
      title: "Total Active Rails",
      value: formatCompactNumber(data?.totalActiveRails || 0),
      icon: "/stats/active-rails.svg",
      tooltip: "Payment streams that are currently running",
    },
    {
      title: "Total Terminated Rails",
      value: formatCompactNumber(data?.totalTerminatedRails || 0),
      icon: "/stats/terminated-rails.svg",
      tooltip: "Payment streams that have been permanently stopped",
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
      <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
        {cards.map((card) => (
          <MetricItem
            key={card.title}
            title={card.title}
            value={card.value?.toString() || "0"}
            icon={card.icon}
            tooltip={card.tooltip}
          />
        ))}
      </div>
    </StatsLayout>
  );
};

export default Stats;
