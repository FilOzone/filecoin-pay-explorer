import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import type { IconProps } from "@phosphor-icons/react";
import { Info } from "lucide-react";
import Image from "next/image";

interface MetricItemProps {
  title: string;
  value: React.ReactNode;
  Icon?: string | React.ComponentType<IconProps>;
  tooltip?: string;
}

const MetricItem: React.FC<MetricItemProps> = ({ title, value, Icon, tooltip }) => (
  <div className='flex gap-5 rounded-2xl border border-(--color-border-base) p-6'>
    {Icon &&
      (typeof Icon === "string" ? (
        <Image src={Icon} alt={title} width={60} height={60} />
      ) : (
        <Icon size={60} weight='thin' color='#1EBFFF' className='w-15 h-15' />
      ))}
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
