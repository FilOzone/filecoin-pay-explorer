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
import { zeroAddress } from "viem";
import { getChain } from "@/constants/chains";
import { useBlockNumber } from "@/hooks/useBlockNumber";
import useNetwork from "@/hooks/useNetwork";
import { useStatsDashboard } from "@/hooks/useStatsDashboard";
import { formatCompactNumber, formatToken } from "@/utils/formatter";
import { calculateTotalLockup } from "@/utils/lockup";
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

const DEFAULT_TOKEN_VALUE = "0";

const Stats: React.FC = () => {
  const { network } = useNetwork();

  const chain = getChain(network);
  const { data, isLoading, isError, error, refetch } = useStatsDashboard(chain.contracts.usdfc.address, zeroAddress);
  const { data: blockNumber, isLoading: loadingBlockNumber } = useBlockNumber();

  const cards = useMemo<MetricCard[]>(
    () => [
      {
        title: "Unique Payers",
        value: formatCompactNumber(data?.paymentsMetrics?.uniquePayers || 0),
        icon: "/stats/unique-payers.svg",
      },
      {
        title: "Unique Payees",
        value: formatCompactNumber(data?.paymentsMetrics?.uniquePayees || 0),
        icon: "/stats/unique-payees.svg",
      },
      {
        title: "Total USDFC",
        value: data?.usdfcToken
          ? formatToken(data.usdfcToken.userFunds, data.usdfcToken.decimals, "USDFC")
          : `${DEFAULT_TOKEN_VALUE} USDFC`,
        icon: CurrencyCircleDollarIcon,
      },
      {
        title: "Total USDFC Locked",
        value: data?.usdfcToken
          ? formatToken(
              calculateTotalLockup(
                data.usdfcToken.lockupCurrent,
                data.usdfcToken.lockupRate,
                data.usdfcToken.lockupLastSettledUntilEpoch,
                blockNumber,
              ),
              data.usdfcToken.decimals,
              "USDFC",
            )
          : `${DEFAULT_TOKEN_VALUE} USDFC`,
        icon: LockIcon,
        isLoading: loadingBlockNumber,
      },
      {
        title: "Total FIL Locked",
        value: data?.filToken
          ? formatToken(
              calculateTotalLockup(
                data.filToken.lockupCurrent,
                data.filToken.lockupRate,
                data.filToken.lockupLastSettledUntilEpoch,
                blockNumber,
              ),
              data.filToken.decimals,
              "FIL",
            )
          : `${DEFAULT_TOKEN_VALUE} FIL`,
        icon: LockIcon,
        isLoading: loadingBlockNumber,
      },
      {
        title: "Total Rails",
        value: formatCompactNumber(data?.paymentsMetrics?.totalRails || 0),
        icon: "/stats/total-rails.svg",
        tooltip: "Ongoing payment streams between users",
      },
      {
        title: "Services",
        value: formatCompactNumber(data?.paymentsMetrics?.totalOperators || 0),
        icon: "/stats/total-services.svg",
        tooltip: "Payment managers that help automate transactions between users",
      },
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
      {
        title: "Rail Settlements",
        value: formatCompactNumber(data?.paymentsMetrics?.totalRailSettlements || 0),
        icon: CoinVerticalIcon,
      },
      {
        title: "Idle Rails",
        value: formatCompactNumber(data?.paymentsMetrics?.totalZeroRateRails || 0),
        icon: "/stats/idle-rails.svg",
        tooltip: "Paused payment streams that are currently inactive",
      },
      {
        title: "Active Rails",
        value: formatCompactNumber(data?.paymentsMetrics?.totalActiveRails || 0),
        icon: "/stats/active-rails.svg",
        tooltip: "Payment streams that are currently running",
      },
      {
        title: "Terminated Rails",
        value: formatCompactNumber(data?.paymentsMetrics?.totalTerminatedRails || 0),
        icon: "/stats/terminated-rails.svg",
        tooltip: "Payment streams that have been permanently stopped",
      },
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
