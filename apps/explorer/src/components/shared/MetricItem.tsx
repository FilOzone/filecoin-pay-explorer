import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { Info } from "lucide-react";

interface MetricItemProps {
  title: string;
  value: React.ReactNode;
  tooltip?: string;
}

const MetricItem: React.FC<MetricItemProps> = ({ title, value, tooltip }) => (
  <div className='p-4 border rounded-lg bg-card text-card-foreground shadow-sm'>
    <div className='flex items-center gap-1.5 mb-1'>
      <h3 className='text-sm font-medium text-muted-foreground'>{title}</h3>
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
    <p className='text-2xl font-semibold'>{value ?? "N/A"}</p>
  </div>
);

export default MetricItem;
