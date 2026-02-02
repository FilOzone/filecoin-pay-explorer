import type { Rail } from "@filecoin-pay/types";
import { useMemo } from "react";
import { formatCompactNumber, formatToken } from "@/utils/formatter";
import { DetailCard } from "./DetailCard";

interface RailOverviewProps {
  rail: Rail;
}

export const RailOverview: React.FC<RailOverviewProps> = ({ rail }) => {
  const { totalNetPayeeAmount, totalCommission } = useMemo(() => {
    const totalTransactedAmount = rail.totalOneTimePaymentAmount + rail.totalSettledAmount;
    const totalNetworkFees = (totalTransactedAmount * 5n) / 1000n;
    const totalCommission = (totalTransactedAmount * 995n * rail.commissionRateBps) / 10000000n;
    const totalNetPayeeAmount = totalTransactedAmount - totalNetworkFees - totalCommission;
    return { totalNetPayeeAmount, totalCommission };
  }, [rail.totalOneTimePaymentAmount, rail.totalSettledAmount, rail.commissionRateBps]);

  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
      <DetailCard label='Payer' value={rail.payer.address} isAddress linkTo={`/account/${rail.payer.address}`} />
      <DetailCard label='Payee' value={rail.payee.address} isAddress linkTo={`/account/${rail.payee.address}`} />
      <DetailCard
        label='Operator address'
        value={rail.operator.address}
        isAddress
        linkTo={`/operator/${rail.operator.address}`}
      />

      <DetailCard label='Token' value={`${rail.token.symbol} (${rail.token.name})`} />
      <DetailCard
        label='Payment Rate'
        value={formatToken(rail.paymentRate, rail.token.decimals, `${rail.token.symbol}/epoch`, 12)}
      />
      <DetailCard
        label='Lockup Fixed'
        value={formatToken(rail.lockupFixed, rail.token.decimals, rail.token.symbol, 2)}
      />

      <DetailCard label='Lockup Period' value={`${rail.lockupPeriod.toString()} epochs`} />
      <DetailCard label='Settled Upto' value={`Epoch ${rail.settledUpto.toString()}`} />

      <DetailCard
        label='Total Settled Amount'
        value={formatToken(rail.totalSettledAmount, rail.token.decimals, rail.token.symbol, 8)}
      />
      <DetailCard
        label='Total Net Payee Amount'
        value={formatToken(totalNetPayeeAmount, rail.token.decimals, rail.token.symbol, 8)}
      />
      <DetailCard
        label='Total Commission'
        value={formatToken(totalCommission, rail.token.decimals, rail.token.symbol, 8)}
      />

      <DetailCard label='Commission Rate' value={`${(Number(rail.commissionRateBps) / 100).toFixed(2)}%`} />
      <DetailCard label='Total Settlements' value={formatCompactNumber(rail.totalSettlements)} />

      <DetailCard label='Arbiter' value={rail.arbiter} isAddress={false} />
      <DetailCard label='Service Fee Recipient' value={rail.serviceFeeRecipient} isAddress={false} />
      <DetailCard
        label='Created At'
        value={new Date(Number(rail.createdAt) * 1000).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      />
    </div>
  );
};
