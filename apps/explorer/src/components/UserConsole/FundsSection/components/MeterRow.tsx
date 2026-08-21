import { cn } from "@filecoin-pay/ui/lib/utils";

type MeterRowProps = {
  /** Names the metric, and is the bar's accessible name. */
  label: string;
  /** Optional smaller line under the label, spelling out the figures behind the bar. */
  detail?: string;
  /** The reading, shown at the right of the row. Also the bar's `aria-valuetext`. */
  value: string;
  /** Fill width, 0–100. Callers clamp; this component does not rescale. */
  percent: number;
  fillClassName: string;
  trackClassName: string;
  valueClassName?: string;
};

/**
 * One horizontal metric: label, optional detail, a proportional bar, and the
 * reading.
 *
 * The bar is decoration for `value`, and the row states its meaning in text, so
 * nothing here depends on a user distinguishing the fill colors.
 */
const MeterRow = ({ label, detail, value, percent, fillClassName, trackClassName, valueClassName }: MeterRowProps) => (
  <div className='flex flex-wrap items-center gap-x-3 gap-y-2 sm:contents'>
    <div className='min-w-0 flex-1 sm:flex-none'>
      <p className='text-sm font-medium text-foreground'>{label}</p>
      {detail ? <p className='truncate text-xs text-muted-foreground'>{detail}</p> : null}
    </div>
    <div
      role='progressbar'
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-valuetext={value}
      className={cn("order-last h-2 w-full overflow-hidden rounded-full sm:order-none", trackClassName)}
    >
      <div className={cn("h-full rounded-full", fillClassName)} style={{ width: `${percent}%` }} />
    </div>
    <p className={cn("shrink-0 text-sm font-medium tabular-nums text-foreground", valueClassName)}>{value}</p>
  </div>
);

export default MeterRow;
