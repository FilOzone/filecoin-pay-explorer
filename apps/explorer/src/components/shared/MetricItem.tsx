import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { Info } from "lucide-react";
import Image from "next/image";

interface MetricItemProps {
  title: string;
  value: React.ReactNode;
  icon?: string;
  tooltip?: string;
}

const MetricItem: React.FC<MetricItemProps> = ({ title, value, icon, tooltip }) => (
  <div className='flex gap-5 rounded-2xl border border-(--color-border-base) p-6'>
    {icon && <Image src={icon} alt={title} width={60} height={60} />}
    <div className='flex flex-col'>
      <div className='flex items-center gap-1 mb-1'>
        <span className='text-(--color-paragraph-text)'>{title}</span>
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
      <span className='text-2xl font-bold text-(--color-text-base)'>{value}</span>
    </div>
  </div>
);

export default MetricItem;
