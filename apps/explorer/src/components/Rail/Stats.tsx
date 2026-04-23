import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import type { Rail } from "@filecoin-pay/types";
import {
  CalendarCheckIcon,
  CalendarPlusIcon,
  CheckCircleIcon,
  CoinsIcon,
  GavelIcon,
  HandDepositIcon,
  HandWithdrawIcon,
  HourglassIcon,
  LockIcon,
  ReceiptIcon,
  StackIcon,
  TagIcon,
  TrendUpIcon,
  UserGearIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { formatCompactNumber, formatToken } from "@/utils/formatter";
import { CopyableText, MetricItem } from "../shared";

interface StatsLayoutProps {
  children: React.ReactNode;
}

const StatsLayout: React.FC<StatsLayoutProps> = ({ children }) => (
  <PageSection backgroundVariant='light'>
    <div className='flex flex-col gap-6 -mt-15'>
      <h3 className='text-2xl font-medium'>Rail Stats</h3>
      {children}
    </div>
  </PageSection>
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

  return (
    <StatsLayout>
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

        <MetricItem title='Token' value={`${rail.token.symbol} (${rail.token.name})`} Icon={CoinsIcon} />
        <MetricItem
          title='Payment Rate'
          value={formatToken(rail.paymentRate, rail.token.decimals, `${rail.token.symbol}/epoch`, 12)}
          Icon={TrendUpIcon}
        />
        <MetricItem
          title='Lockup Fixed'
          value={formatToken(rail.lockupFixed, rail.token.decimals, rail.token.symbol, 2)}
          Icon={LockIcon}
        />

        <MetricItem title='Lockup Period' value={`${rail.lockupPeriod.toString()} epochs`} Icon={HourglassIcon} />
        <MetricItem title='Settled Upto' value={`Epoch ${rail.settledUpto.toString()}`} Icon={CalendarCheckIcon} />

        <MetricItem
          title='Total Settled Amount'
          value={formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 8)}
          Icon={CheckCircleIcon}
        />
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

        <MetricItem
          title='Commission Rate'
          value={`${(Number(rail.commissionRateBps) / 100).toFixed(2)}%`}
          Icon={TagIcon}
        />
        <MetricItem title='Total Settlements' value={formatCompactNumber(rail.totalSettlements)} Icon={StackIcon} />

        <MetricItem
          title='Arbiter'
          value={
            <CopyableText
              value={rail.arbiter}
              monospace={true}
              label='Arbiter address'
              truncate={true}
              truncateLength={8}
            />
          }
          Icon={GavelIcon}
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
        <MetricItem
          title='Created At'
          value={new Date(Number(rail.createdAt) * 1000).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          Icon={CalendarPlusIcon}
        />
      </div>
    </StatsLayout>
  );
};
