"use client";

import { cn } from "@filecoin-pay/ui/lib/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Wraps a wide table for small screens: the first column stays put while the
 * rest scrolls, the right edge fades, and a hint says so, but only while the
 * table is actually wider than its container.
 */
export function ResponsiveTable({ children, className }: { children: ReactNode; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    // The table keeps its natural width inside the library's scroll container,
    // so comparing it with this wrapper says whether anything is hidden.
    const measure = () => {
      const table = container.querySelector("table");
      setOverflowing(!!table && table.scrollWidth > container.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const table = container.querySelector("table");
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, []);

  return (
    <div className='grid min-w-0 gap-2'>
      {/* min-w-0 keeps the wrapper at the column's width; the library's container does the scrolling. */}
      <div
        className={cn(
          "relative min-w-0 w-full overflow-hidden",
          "[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10 [&_th:first-child]:bg-background",
          "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-background",
          isOverflowing &&
            "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-10 after:bg-gradient-to-l after:from-background after:to-transparent",
          className,
        )}
        data-overflowing={isOverflowing}
        ref={containerRef}
      >
        {children}
      </div>
      {isOverflowing ? (
        <p aria-live='polite' className='text-xs text-muted-foreground md:hidden'>
          Scroll sideways to see the rest of the table.
        </p>
      ) : null}
    </div>
  );
}
