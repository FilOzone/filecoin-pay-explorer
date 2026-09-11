"use client";

import { cn } from "@filecoin-pay/ui/lib/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";

// TanstackTable stripes odd rows on the <tr>, so the pinned first cell has to
// repeat the row colour or the row looks cut where the cell overlaps it.
const PINNED_FIRST_COLUMN = [
  "[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10 [&_th:first-child]:bg-table-background",
  "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-table-background",
  "[&_tbody_tr:nth-child(odd)_td:first-child]:bg-(--color-table-row-striped)",
];

/** Keeps a wide table usable on narrow screens: pinned first column, edge fade, scroll hint. */
export function ResponsiveTable({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const table = container?.querySelector("table");
    // The library table scrolls inside its own container, so that element owns the scroll position.
    const scroller = table?.parentElement ?? container;
    if (!container || !table || !scroller || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const overflows = table.scrollWidth > container.clientWidth + 1;
      setIsOverflowing(overflows);
      setCanScrollRight(overflows && scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(table);
    scroller.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", measure);
    };
  }, []);

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
