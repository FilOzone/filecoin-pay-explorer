import type { ReactNode } from "react";

type SpendChartLayoutProps = {
  children: ReactNode;
  tokenSymbol: string;
};

/**
 * Heading and framing shared by the chart and its loading, error and empty states.
 *
 * "Scheduled", never "cost" or "paid" — see `utils/accrueSpend.ts`.
 */
const SpendChartLayout = ({ children, tokenSymbol }: SpendChartLayoutProps) => (
  <div className='flex flex-col gap-4'>
    <div className='flex flex-wrap items-baseline justify-between gap-2'>
      <h3 className='text-2xl font-medium text-foreground sm:text-3xl'>Scheduled monthly spend</h3>
      <p className='text-sm text-muted-foreground'>Maximum {tokenSymbol} scheduled over the last six months</p>
    </div>
    {children}
  </div>
);

export default SpendChartLayout;
