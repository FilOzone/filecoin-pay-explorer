import type { Account } from "@filecoin-pay/types";
import { Card } from "@filecoin-pay/ui/components/card";
import { formatCompactNumber } from "@/utils/formatter";

interface AccountOverviewProps {
  account: Account;
}

interface DetailCardProps {
  label: string;
  value: string;
}

const DetailCard: React.FC<DetailCardProps> = ({ label, value }) => (
  <Card className='p-4'>
    <div className='flex flex-col gap-1'>
      <span className='text-sm text-muted-foreground'>{label}</span>
      <span className='font-medium break-all'>{value}</span>
    </div>
  </Card>
);

export const AccountOverview: React.FC<AccountOverviewProps> = ({ account }) => {
  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
      <Card className='p-4 md:col-span-2 lg:col-span-4'>
        <div className='flex flex-col gap-1'>
          <span className='text-sm text-muted-foreground'>Account Address</span>
          <div className='font-mono text-sm font-medium break-all'>{account.address}</div>
        </div>
      </Card>

      <DetailCard label='Total Rails' value={formatCompactNumber(account.totalRails)} />
      <DetailCard label='Total Tokens' value={formatCompactNumber(account.totalTokens)} />
      <DetailCard label='Total Approvals' value={formatCompactNumber(account.totalApprovals)} />
    </div>
  );
};
