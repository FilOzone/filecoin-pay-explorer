import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import type { Rail, RailState } from "@filecoin-pay/types";
import {
  CalendarCheckIcon,
  CalendarPlusIcon,
  CalendarSlashIcon,
  CheckCircleIcon,
  CoinsIcon,
  GavelIcon,
  HandDepositIcon,
  HandWithdrawIcon,
  HourglassIcon,
  LockIcon,
  ReceiptIcon,
  TagIcon,
  TrendUpIcon,
  UserGearIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { useBlockNumber } from "@/hooks/useBlockNumber";
import { EPOCH_DURATION } from "@/utils/constants";
import { epochToDate, formatToken } from "@/utils/formatter";
import { CopyableText, MetricItem, RailStateBadge } from "../../shared";

interface StatsLayoutProps {
  children: React.ReactNode;
  railId: string;
  state: RailState;
}

const StatsLayout: React.FC<StatsLayoutProps> = ({ children, railId, state }) => (
  <PageSection backgroundVariant='light'>
    <div className='flex flex-col gap-6 -mt-15'>
      <div className='flex items-center justify-between'>
        <h3 className='text-2xl font-medium'>Rail #{railId}</h3>
        <RailStateBadge state={state} />
      </div>
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

interface StatsProps {
  rail: Rail;
}

export const Stats: React.FC<StatsProps> = ({ rail }) => {
  const { totalNetPayeeAmount, totalCommission } = useMemo(() => {
    const totalTransactedAmount = BigInt(rail.totalOneTimePaymentAmount) + BigInt(rail.totalSettledAmount);
    const totalNetworkFees = (totalTransactedAmount * 5n) / 1000n;
    const totalCommission = (totalTransactedAmount * 995n * BigInt(rail.commissionRateBps)) / 10000000n;
    const totalNetPayeeAmount = totalTransactedAmount - totalNetworkFees - totalCommission;
    return { totalNetPayeeAmount, totalCommission };
  }, [rail.totalOneTimePaymentAmount, rail.totalSettledAmount, rail.commissionRateBps]);
  const isOneTimePaymentOnly =
    BigInt(rail.totalOneTimePaymentAmount) > 0n &&
    BigInt(rail.paymentRate) === 0n &&
    BigInt(rail.lockupFixed) === 0n &&
    BigInt(rail.lockupPeriod) === 0n &&
    rail.validator === "0x0000000000000000000000000000000000000000";
  const { data: currentBlock, isLoading, isError, refetch, error } = useBlockNumber();

  return (
    <StatsLayout railId={String(rail.railId)} state={rail.state}>
      {isLoading && <LoadingStateCard message='Loading Stats...' />}

      {isError && <ErrorState refetch={refetch} error={error} />}

      {!isLoading && !isError && currentBlock && (
        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
          <MetricItem
            title='Payer'
            value={
              <CopyableText
                value={rail.payer.address}
                // to={`/account/${rail.payer.address}`}
                monospace={true}
                label='Payer address'
                truncate={true}
                truncateLength={8}
              />
            }
            Icon={HandDepositIcon}
          />
          <MetricItem
            title='Payee'
            value={
              <CopyableText
                value={rail.payee.address}
                // to={`/account/${rail.payee.address}`}
                monospace={true}
                label='Payee address'
                truncate={true}
                truncateLength={8}
              />
            }
            Icon={HandWithdrawIcon}
          />
          <MetricItem
            title='Operator'
            value={
              <CopyableText
                value={rail.operator.address}
                // to={`/account/${rail.operator.address}`}
                monospace={true}
                label='Operator address'
                truncate={true}
                truncateLength={8}
              />
            }
            Icon={UserGearIcon}
          />

          <MetricItem title='Token' value={rail.token.symbol} Icon={CoinsIcon} />

          {!isOneTimePaymentOnly && (
            <>
              <MetricItem
                title='Payment Rate'
                value={formatToken(
                  (Number(rail.paymentRate) / EPOCH_DURATION) * 60 * 60 * 24,
                  rail.token.decimals,
                  `${rail.token.symbol}/day`,
                  12,
                )}
                tooltip={`${formatToken(
                  Number(rail.paymentRate),
                  rail.token.decimals,
                  `${rail.token.symbol}`,
                  12,
                )}/epoch`}
                Icon={TrendUpIcon}
              />
              {BigInt(rail.lockupFixed) > 0n && (
                <MetricItem
                  title='Lockup Fixed'
                  value={formatToken(rail.lockupFixed, rail.token.decimals, rail.token.symbol, 2)}
                  Icon={LockIcon}
                />
              )}
              {BigInt(rail.paymentRate) > 0n && BigInt(rail.lockupPeriod) > 0n && (
                <MetricItem
                  title='Lockup Period'
                  value={`${Math.ceil((Number(rail.lockupPeriod) * EPOCH_DURATION) / 60 / 60 / 24)} days`}
                  tooltip={`${Number(rail.lockupPeriod)} epochs`}
                  Icon={HourglassIcon}
                />
              )}
            </>
          )}

          {Number(rail.totalSettlements) > 0 && (
            <>
              <MetricItem
                title='Settled Upto'
                value={epochToDate(rail.settledUpto, currentBlock).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                tooltip={`Epoch ${rail.settledUpto}`}
                Icon={CalendarCheckIcon}
              />
              <MetricItem
                title='Total Settled Amount'
                value={formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 8)}
                Icon={CheckCircleIcon}
              />
            </>
          )}

          {Number(rail.totalOneTimePayments) > 0 && (
            <MetricItem
              title='Paid One Time'
              value={formatToken(rail.totalOneTimePaymentAmount, rail.token.decimals, rail.token.symbol, 8)}
              Icon={CheckCircleIcon}
            />
          )}
          <MetricItem
            title='Total Net Payee Amount'
            value={formatToken(totalNetPayeeAmount, rail.token.decimals, rail.token.symbol, 8)}
            Icon={WalletIcon}
          />
          <MetricItem
            title='Total Commission'
            value={formatToken(totalCommission, rail.token.decimals, rail.token.symbol, 8)}
            Icon={TagIcon}
          />

          {Number(rail.commissionRateBps) > 0 && (
            <>
              <MetricItem
                title='Commission Rate'
                value={`${(Number(rail.commissionRateBps) / 100).toFixed(2)}%`}
                Icon={TagIcon}
              />
              <MetricItem
                title='Service Fee Recipient'
                value={
                  <CopyableText
                    value={rail.serviceFeeRecipient}
                    monospace={true}
                    label='Service Fee Recipient address'
                    truncate={true}
                    truncateLength={8}
                  />
                }
                Icon={ReceiptIcon}
              />
            </>
          )}

          {!isOneTimePaymentOnly && (
            <MetricItem
              title='Validator'
              value={
                <CopyableText
                  value={rail.validator}
                  monospace={true}
                  label='Validator address'
                  truncate={true}
                  truncateLength={8}
                />
              }
              Icon={GavelIcon}
            />
          )}
          <MetricItem
            title='Created At'
            value={new Date(Number(rail.createdAt) * 1000).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            Icon={CalendarPlusIcon}
          />
          {Number(rail.endEpoch) > 0 && !isOneTimePaymentOnly && (
            <MetricItem
              title='Ends At'
              value={epochToDate(rail.endEpoch, currentBlock).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              tooltip={`Epoch ${rail.endEpoch}`}
              Icon={CalendarSlashIcon}
            />
          )}
        </div>
      )}
    </StatsLayout>
  );
};
