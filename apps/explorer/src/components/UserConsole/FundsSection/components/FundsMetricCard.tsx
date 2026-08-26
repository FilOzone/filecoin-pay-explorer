import { Card } from "@filecoin-pay/ui/components/card";
import { cn } from "@filecoin-pay/ui/lib/utils";
import type { ReactNode } from "react";

type FundsMetricCardProps = {
  label: string;
  value: string;
  /** Secondary line under the value — the plain-text half of any colour-coded state. */
  detail?: string;
  icon?: ReactNode;
  valueClassName?: string;
  /** Tints the detail line, so a colour-coded card can carry it through. */
  detailClassName?: string;
  /** Card-level styling, used by the tier-tinted Funded until card. */
  className?: string;
};

const FundsMetricCard = ({
  label,
  value,
  detail,
  icon,
  valueClassName,
  detailClassName,
  className,
}: FundsMetricCardProps) => (
  <Card className={cn("gap-1.5 p-4", className)}>
    <p className='text-sm text-muted-foreground'>{label}</p>
    <p className={cn("flex items-center gap-1.5 text-xl font-medium tabular-nums text-foreground", valueClassName)}>
      {icon}
      <span className='min-w-0'>{value}</span>
    </p>
    {detail ? <p className={cn("text-xs text-muted-foreground", detailClassName)}>{detail}</p> : null}
  </Card>
);

export default FundsMetricCard;
