import type { Account } from "@filecoin-pay/types";
import { Card } from "@filecoin-pay/ui/components/card";
import { Skeleton } from "@filecoin-pay/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { Info, User } from "lucide-react";
import { formatCompactNumber } from "@/utils/formatter";
import { CopyableText } from "../shared";

interface AccountInfoProps {
  account: Account;
  address: string;
}

interface StatCardProps {
  label: string;
  value: string;
  tooltip?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, tooltip }) => (
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
      <span className='text-2xl font-bold'>{value}</span>
    </div>
  </Card>
);

export const AccountInfoSkeleton = () => (
  <div className='flex flex-col gap-4'>
    <h2 className='text-2xl font-semibold'>Account Info</h2>
    <Card className='p-6'>
      <div className='flex items-center gap-4 mb-6'>
        <Skeleton className='h-12 w-12 rounded-full' />
        <div className='flex-1'>
          <Skeleton className='h-6 w-48 mb-2' />
          <Skeleton className='h-4 w-32' />
        </div>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className='h-24 w-full' />
        ))}
      </div>
    </Card>
  </div>
);

export const AccountInfo: React.FC<AccountInfoProps> = ({ account, address }) => {
  return (
    <div className='flex flex-col gap-4'>
      <h2 className='text-2xl font-semibold'>Account Info</h2>
      <Card className='p-6'>
        {/* Account Header */}
        <div className='flex items-center gap-4 mb-6'>
          <div className='h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center'>
            <User className='h-6 w-6 text-primary' />
          </div>
          <div className='flex-1'>
            <h3 className='text-lg font-semibold'>Connected Account</h3>
            <CopyableText value={address} monospace={true} label='Account address' truncate={true} truncateLength={8} />
          </div>
        </div>

        {/* Stats Grid */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <StatCard label='Total Rails' value={formatCompactNumber(account.totalRails)} />
          <StatCard label='Total Tokens' value={formatCompactNumber(account.totalTokens)} />
          <StatCard
            label='Total Approvals'
            value={formatCompactNumber(account.totalApprovals)}
            tooltip='How many payment managers this account has given permission to use their tokens'
          />
        </div>
      </Card>
    </div>
  );
};
