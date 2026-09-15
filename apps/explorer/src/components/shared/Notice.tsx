import { cn } from "@filecoin-pay/ui/lib/utils";
import type { ReactNode } from "react";

const TONES = {
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  warn: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  error: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  ok: "border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
};

interface NoticeProps {
  tone: keyof typeof TONES;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: string;
}

/** An inline callout: one border and tint per tone, so every banner on a page reads the same. */
export function Notice({ tone, title, children, className, role }: NoticeProps) {
  return (
    <div role={role} className={cn("rounded-lg border p-3 text-sm", TONES[tone], className)}>
      {title && <p className='font-semibold'>{title}</p>}
      {children}
    </div>
  );
}
