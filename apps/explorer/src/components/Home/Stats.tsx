"use client";

import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
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
import type { IconProps } from "@phosphor-icons/react";
import { CoinsIcon } from "@phosphor-icons/react";
import { AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { zeroAddress } from "viem";
import { getChain } from "@/constants/chains";
import useNetwork from "@/hooks/useNetwork";
import { useStatsDashboard } from "@/hooks/useStatsDashboard";
import { formatToken } from "@/utils/formatter";
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
  <Card>
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon' className='text-brand-error'>
          <AlertCircle />
        </EmptyMedia>
        <EmptyTitle className='text-brand-error'>Something went wrong</EmptyTitle>
        <EmptyDescription>{error?.message || "Failed to fetch data"}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={refetch}>Retry</Button>
      </EmptyContent>
    </Empty>
  </Card>
);

interface MetricCard {
  title: string;
  value: string;
  icon: string | React.ComponentType<IconProps>;
  tooltip?: string;
  isLoading?: boolean;
}

const DEFAULT_TOKEN_VALUE = "0";

const Stats: React.FC = () => {
  const { network } = useNetwork();

  const chain = getChain(network);
  const { data, isLoading, isError, error, refetch } = useStatsDashboard(chain.contracts.usdfc.address, zeroAddress);

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
      {
        title: "Total USDFC Transacted",
        value: data?.usdfcToken
          ? formatToken(
              BigInt(data.usdfcToken.totalSettledAmount) + BigInt(data.usdfcToken.totalOneTimePayment),
              data.usdfcToken.decimals,
              "USDFC",
              5,
            )
          : `${DEFAULT_TOKEN_VALUE} USDFC`,
        icon: CoinsIcon,
      },
      {
        title: "Total FIL Transacted",
        value: data?.filToken
          ? formatToken(
              BigInt(data.filToken.totalSettledAmount) + BigInt(data.filToken.totalOneTimePayment),
              data.filToken.decimals,
              "FIL",
              5,
            )
          : `${DEFAULT_TOKEN_VALUE} FIL`,
        icon: CoinsIcon,
      },
    ],
    [data],
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
