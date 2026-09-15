import { cn } from "@filecoin-pay/ui/lib/utils";
import type { ReactNode } from "react";

// TanstackTable stripes odd rows on the <tr>, so the pinned first cell has to
// repeat the row colour or the row looks cut where the cell overlaps it.
const PINNED_FIRST_COLUMN = [
  "[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10 [&_th:first-child]:bg-table-background",
  "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-table-background",
  "[&_tbody_tr:nth-child(odd)_td:first-child]:bg-(--color-table-row-striped)",
];

/** Pins the first column of a wide table. */
export function ResponsiveTable({ children }: { children: ReactNode }) {

  return (
    <div className='grid min-w-0 gap-2'>
      <div className={cn("relative w-full min-w-0", ...PINNED_FIRST_COLUMN)} ref={containerRef}>
        {children}
        {canScrollRight ? (
          <div
            aria-hidden
            className='pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-xl bg-gradient-to-l from-background to-transparent'
          />
        ) : null}
      </div>
      {isOverflowing ? (
        <p aria-live='polite' className='text-xs text-muted-foreground md:hidden'>
          Scroll sideways to see the rest of the table.
        </p>
      ) : null}
    </div>
  );
}
