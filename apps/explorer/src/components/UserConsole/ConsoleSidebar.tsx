"use client";

import { clsx } from "clsx";
import { Bell, Compass, LayoutGrid, type LucideIcon, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConnection } from "wagmi";
import { PATHS } from "@/constants/paths";
import useNetwork from "@/hooks/useNetwork";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";

type SidebarItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
};

const ConsoleSidebar = () => {
  const pathname = usePathname();
  const { network } = useNetwork();
  const { address, isConnected } = useConnection();
  const { data: notificationStatus } = useNotificationStatus(address);

  // Only badge a definitive "not subscribed"; while status is unknown the row
  // stays unbadged instead of flashing OFF.
  const alertsBadge = isConnected && notificationStatus && !notificationStatus.subscribed ? "OFF" : undefined;

  const items: SidebarItem[] = [
    { label: "Dashboard", href: PATHS.CONSOLE.path, icon: LayoutGrid },
    { label: PATHS.CONSOLE_AUTHORIZATIONS.label, href: PATHS.CONSOLE_AUTHORIZATIONS.path, icon: ShieldCheck },
    { label: PATHS.CONSOLE_ALERTS.label, href: PATHS.CONSOLE_ALERTS.path, icon: Bell, badge: alertsBadge },
  ];

  return (
    <aside className='w-full shrink-0 lg:w-56'>
      <nav aria-label='Console navigation' className='flex flex-row gap-1 overflow-x-auto lg:flex-col'>
        {items.map((item) => {
          // Dashboard is the section root, so it only matches exactly; other
          // items also own their subroutes (e.g. Alerts covers /notifications/verify).
          const active =
            item.href === PATHS.CONSOLE.path
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "inline-flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors lg:border-l-2 lg:rounded-none",
                active
                  ? "font-medium text-zinc-900 lg:border-zinc-900"
                  : "text-zinc-500 hover:text-zinc-900 lg:border-transparent",
              )}
            >
              <Icon className='size-4.5' />
              {item.label}
              {item.badge && <span className='text-xs font-medium text-zinc-400'>{item.badge}</span>}
            </Link>
          );
        })}

        <div className='mx-3 my-3 hidden border-t border-zinc-200 lg:block' />

        <Link
          href={`/${network}`}
          className='inline-flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-900 lg:rounded-none lg:border-l-2 lg:border-transparent'
        >
          <Compass className='size-4.5' />
          Pay Explorer
        </Link>
      </nav>
    </aside>
  );
};

export default ConsoleSidebar;
