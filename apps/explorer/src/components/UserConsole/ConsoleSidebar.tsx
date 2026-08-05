"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Console left sidebar: first step toward the platform-IA console layout.
 * Groups: Overview (Dashboard) and Access (Session keys) — no dead entries.
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

export default ConsoleSidebar;
