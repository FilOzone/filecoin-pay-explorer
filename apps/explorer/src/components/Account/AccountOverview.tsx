import type { Account } from "@filecoin-pay/types";
import { Card } from "@filecoin-pay/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { Info } from "lucide-react";
import { formatCompactNumber } from "@/utils/formatter";
import { CopyableText } from "../shared";

interface AccountOverviewProps {
  account: Account;
}

interface DetailCardProps {
  label: string;
  value: string;
  tooltip?: string;
}

const DetailCard: React.FC<DetailCardProps> = ({ label, value, tooltip }) => (
  <Card className='p-4'>
    <div className='flex flex-col gap-1'>
      <div className='flex items-center gap-1.5'>
        <span className='text-sm text-muted-foreground'>{label}</span>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className='h-3.5 w-3.5 text-muted-foreground cursor-help' />
            </TooltipTrigger>
            <TooltipContent side='top' className='max-w-xs'>
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
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
          <CopyableText value={account.address} monospace={true} label='Account' />
        </div>
      </Card>

      <DetailCard label='Total Rails' value={formatCompactNumber(account.totalRails)} />
      <DetailCard label='Total Tokens' value={formatCompactNumber(account.totalTokens)} />
      <DetailCard
        label='Total Approvals'
        value={formatCompactNumber(account.totalApprovals)}
        tooltip='How many payment managers this account has given permission to use their tokens'
      />
    </div>
  );
};
