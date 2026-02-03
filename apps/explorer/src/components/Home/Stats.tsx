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
import { CoinsIcon, CoinVerticalIcon, CurrencyCircleDollarIcon, LockIcon } from "@phosphor-icons/react";
import { AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { getChain } from "@/constants/chains";
import useNetwork from "@/hooks/useNetwork";
import usePayMetrics from "@/hooks/usePayMetrics";
import { useTokenDetails } from "@/hooks/useTokenDetails";
import { FIL_ADDRESS } from "@/utils/constants";
import { formatCompactNumber, formatFIL, formatToken } from "@/utils/formatter";
import { MetricItem } from "../shared";

interface StatsLayoutProps {
  children: React.ReactNode;
}

const StatsLayout: React.FC<StatsLayoutProps> = ({ children }) => (
  <PageSection backgroundVariant='light' paddingVariant='medium'>
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

const DEFAULT_USDFC_VALUE = "0 USDFC";

const Stats: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = usePayMetrics();
  const { network } = useNetwork();

  const chain = getChain(network);
  const { data: usdfcData, isLoading: isUsdfcLoading } = useTokenDetails(chain.contracts.usdfc.address);

  const { data: filData, isLoading: isFilLoading } = useTokenDetails(FIL_ADDRESS);

  const cards = useMemo<MetricCard[]>(
    () => [
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
        title: "Total USDFC",
        value: usdfcData ? formatToken(usdfcData.userFunds, usdfcData.decimals, "USDFC") : DEFAULT_USDFC_VALUE,
        icon: CurrencyCircleDollarIcon,
        isLoading: isUsdfcLoading,
      },
      {
        title: "Total USDFC Locked",
        value: usdfcData ? formatToken(usdfcData.totalLocked, usdfcData.decimals, "USDFC") : DEFAULT_USDFC_VALUE,
        icon: LockIcon,
        isLoading: isUsdfcLoading,
      },
      {
        title: "Total FIL Locked",
        value: formatFIL(filData?.totalLocked || "0"),
        icon: LockIcon,
        isLoading: isFilLoading,
      },
      {
        title: "Total Rails",
        value: formatCompactNumber(data?.totalRails || 0),
        icon: "/stats/total-rails.svg",
        tooltip: "Ongoing payment streams between users",
      },
      {
        title: "Services",
        value: formatCompactNumber(data?.totalOperators || 0),
        icon: "/stats/total-services.svg",
        tooltip: "Payment managers that help automate transactions between users",
      },
      // TODO: Add this back when network revenue calculation is fixed
      // See https://github.com/FilOzone/filecoin-pay-explorer/issues/70
      // {
      //   title: "Network Revenue",
      //   value: formatFIL(data?.totalFilBurned || "0"),
      //   icon: "/stats/total-fil-burned.svg",
      //   tooltip: "Network fees paid to process payment settlements",
      // },
      {
        title: "USDFC Settled",
        value: usdfcData
          ? formatToken(usdfcData.totalSettledAmount, usdfcData.decimals, "USDFC", 5)
          : DEFAULT_USDFC_VALUE,
        icon: CoinsIcon,
        isLoading: isUsdfcLoading,
      },
      {
        title: "Rail Settlements",
        value: formatCompactNumber(data?.totalRailSettlements || 0),
        icon: CoinVerticalIcon,
      },
      {
        title: "Idle Rails",
        value: formatCompactNumber(data?.totalZeroRateRails || 0),
        icon: "/stats/idle-rails.svg",
        tooltip: "Paused payment streams that are currently inactive",
      },
      {
        title: "Active Rails",
        value: formatCompactNumber(data?.totalActiveRails || 0),
        icon: "/stats/active-rails.svg",
        tooltip: "Payment streams that are currently running",
      },
      {
        title: "Terminated Rails",
        value: formatCompactNumber(data?.totalTerminatedRails || 0),
        icon: "/stats/terminated-rails.svg",
        tooltip: "Payment streams that have been permanently stopped",
      },
    ],
    [data, usdfcData, isUsdfcLoading, filData, isFilLoading],
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
