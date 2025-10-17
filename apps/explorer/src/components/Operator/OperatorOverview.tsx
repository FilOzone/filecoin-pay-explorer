import type { Operator } from "@filecoin-pay/types";
import { Card } from "@filecoin-pay/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { Info } from "lucide-react";
import { explorerUrls } from "@/utils/constants";
import { formatCompactNumber } from "@/utils/formatter";
import { CopyableText } from "../shared";

interface OperatorOverviewProps {
  operator: Operator;
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

export const OperatorOverview: React.FC<OperatorOverviewProps> = ({ operator }) => {
  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
      <Card className='p-4 md:col-span-2 lg:col-span-4'>
        <div className='flex flex-col gap-1'>
          <span className='text-sm text-muted-foreground'>Operator Address</span>
          <CopyableText
            value={operator.address}
            to={`${explorerUrls.calibration}/address/${operator.address}`}
            monospace={true}
            label='Service address'
            external={true}
          />
        </div>
      </Card>

      <DetailCard label='Total Rails' value={formatCompactNumber(operator.totalRails)} />
      <DetailCard label='Total Tokens' value={formatCompactNumber(operator.totalTokens)} />
      <DetailCard
        label='Total Approvals'
        value={formatCompactNumber(operator.totalApprovals)}
        tooltip='How many accounts have given this payment manager permission to handle their payments'
      />
    </div>
  );
};
