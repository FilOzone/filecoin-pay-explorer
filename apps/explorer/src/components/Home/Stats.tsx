"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import type { IconProps } from "@phosphor-icons/react";
import { CoinsIcon, LockIcon } from "@phosphor-icons/react";
import { AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { useBlockNumber } from "@/hooks/useBlockNumber";
import { useStatsDashboard } from "@/hooks/useStatsDashboard";
import { formatToken } from "@/utils/formatter";
import { calculateTotalLockup } from "@/utils/lockup";
import { MetricItem } from "../shared";

interface StatsLayoutProps {
  children: React.ReactNode;
}

const StatsLayout: React.FC<StatsLayoutProps> = ({ children }) => (
  <PageSection backgroundVariant='light'>
    <div className='flex flex-col gap-6 -mt-15'>
      <h3 className='text-2xl font-medium'>Filecoin Pay Stats</h3>
      {children}
    </div>
  </PageSection>
);

interface ErrorStateProps {
  refetch: () => void;
  error: Error | null;
}

const ErrorState: React.FC<ErrorStateProps> = ({ refetch, error }) => (
  <EmptyStateCard
    icon={AlertCircle}
    title='Failed to load stats'
    titleTag='h2'
    description={error?.message || "Something went wrong"}
  >
    <Button onClick={refetch} variant='primary' size='compact'>
      Retry
    </Button>
  </EmptyStateCard>
);

interface MetricCard {
  title: string;
  value: string;
  icon: string | React.ComponentType<IconProps>;
  tooltip?: string;
  isLoading?: boolean;
}

const Stats: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = useStatsDashboard();
  const { data: blockNumber, isLoading: loadingBlockNumber } = useBlockNumber();

  const cards = useMemo<MetricCard[]>(
    () => [
      // TODO: Add this back when network revenue calculation is fixed
      // See https://github.com/FilOzone/filecoin-pay-explorer/issues/70
      // {
      //   title: "Network Revenue",
      //   value: formatFIL(data?.paymentsMetrics?.totalFilBurned || "0"),
      //   icon: "/stats/total-fil-burned.svg",
      //   tooltip: "Network fees paid to process payment settlements",
      // },
      ...(data?.tokens.map((token) => ({
        title: `Total ${token.symbol} Transacted`,
        value: formatToken(
          BigInt(token.totalSettledAmount) + BigInt(token.totalOneTimePayment),
          token.decimals,
          token.symbol,
          5,
        ),
        icon: CoinsIcon,
      })) || []),
      ...(data?.tokens.map((token) => ({
        title: `Total ${token.symbol} Locked`,
        value: formatToken(
          calculateTotalLockup(token.lockupCurrent, token.lockupRate, token.lockupLastSettledUntilEpoch, blockNumber),
          token.decimals,
          token.symbol,
        ),
        icon: LockIcon,
        isLoading: loadingBlockNumber,
      })) || []),
    ],
    [data, blockNumber, loadingBlockNumber],
  );

  return (
    <StatsLayout>
      {isLoading && <LoadingStateCard message='Loading Stats...' />}

      {isError && <ErrorState refetch={refetch} error={error} />}

      {!isLoading && !isError && (
        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
          {cards.map((card) => (
            <MetricItem
              key={card.title}
              title={card.title}
              value={card.value}
              Icon={card.icon}
              tooltip={card.tooltip}
              isLoading={card.isLoading}
            />
          ))}
        </div>
      )}
    </StatsLayout>
  );
};

Stats.displayName = "Stats";

export default Stats;
