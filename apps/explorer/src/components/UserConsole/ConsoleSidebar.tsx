"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Console left sidebar: first step toward the platform-IA console layout. Dashboard, notifications, access.
 */
const GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  { label: "Overview", items: [{ href: "/console", label: "Dashboard" }] },
  { label: "Access", items: [{ href: "/console/session-keys", label: "Session keys" }] },
];

const ConsoleSidebar = () => {
  const pathname = usePathname();

  return (
    <nav aria-label='Console navigation' className='w-48 shrink-0 flex flex-col gap-6'>
      {GROUPS.map((group) => (
        <div key={group.label} className='flex flex-col gap-1'>
          <span className='text-xs font-semibold uppercase tracking-wider text-zinc-500 px-2 mb-1'>{group.label}</span>
          {group.items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "rounded-md px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-zinc-900 text-white font-medium dark:bg-zinc-100 dark:text-zinc-900"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
};

/** Sidebar plus main-column wrapper shared by console pages. */
export const ConsoleLayout = ({ children }: { children: ReactNode }) => (
  <div className='flex gap-12'>
    <ConsoleSidebar />
    <div className='flex flex-col gap-20 flex-1 min-w-0'>{children}</div>
  </div>
);
