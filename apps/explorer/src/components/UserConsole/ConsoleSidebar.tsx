"use client";
import { cn } from "@filecoin-pay/ui/lib/utils";
import { Bell, BellOff, Compass, HardDrive, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useConnection } from "wagmi";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";
import { getNetworkFromChainId, isNotificationsEligibleNetwork } from "@/utils/network";

type ConsoleSidebarProps = {
  /**
   * Called when a nav item is activated. The mobile drawer passes a closer here:
   * Radix does not know about client-side navigation, so without it the sheet
   * stays open on top of the page the user just navigated to.
   */
  onNavigate?: () => void;
};

type SidebarLinkProps = {
  href: string;
  isActive: boolean;
  onNavigate?: () => void;
  children: ReactNode;
};

/**
 * `undefined` means the status is not known yet — still loading, the request
 * failed, or the notifications API is unconfigured. Those render a neutral bell
 * with no ON/OFF label rather than claiming alerts are off.
 */
const AlertsIcon = ({ isSubscribed }: { isSubscribed: boolean | undefined }) => {
  if (isSubscribed === undefined) {
    return <Bell className='size-4' />;
  }

  return isSubscribed ? <Bell className='size-4 fill-current' /> : <BellOff className='size-4' />;
};

const SidebarLink = ({ href, isActive, onNavigate, children }: SidebarLinkProps) => (
  <Link
    href={href}
    onClick={onNavigate}
    aria-current={isActive ? "page" : undefined}
    className={cn(
      "flex items-center gap-2.5 border-l-2 py-2 pl-3 text-sm transition-colors",
      isActive
        ? "border-foreground font-medium text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </Link>
);

export const ConsoleSidebar = ({ onNavigate }: ConsoleSidebarProps) => {
  const pathname = usePathname();
  const { address, chainId } = useConnection();

  const walletNetwork = getNetworkFromChainId(chainId);
  const isNotificationsEligible = isNotificationsEligibleNetwork(walletNetwork);

  // Also read by the console page; React Query dedupes the two subscriptions.
  const { data: notificationStatus } = useNotificationStatus(address);
  const isSubscribed = notificationStatus?.subscribed;

  const isAlertsActive = pathname.startsWith("/console/notifications");
  const isDashboardActive = pathname === "/console";
  const isWarmStorageActive = pathname.startsWith("/console/services/warm-storage");

  // Chrome (border, responsive visibility) belongs to the caller: this renders
  // both as the desktop column and inside the mobile drawer.
  return (
    <nav aria-label='Console' className='sticky top-4 flex w-48 shrink-0 flex-col gap-1 self-start'>
      <SidebarLink href='/console' isActive={isDashboardActive} onNavigate={onNavigate}>
        <LayoutDashboard className='size-4' />
        Dashboard
      </SidebarLink>

      <SidebarLink href='/console/services/warm-storage' isActive={isWarmStorageActive} onNavigate={onNavigate}>
        <HardDrive className='size-4' />
        Warm Storage
      </SidebarLink>

      {isNotificationsEligible ? (
        <SidebarLink href='/console/notifications' isActive={isAlertsActive} onNavigate={onNavigate}>
          <AlertsIcon isSubscribed={isSubscribed} />
          <span className='flex items-baseline gap-1.5'>
            Email Alerts
            {isSubscribed === undefined ? null : (
              <span className={cn("text-xs font-medium", isSubscribed ? "text-green-500" : "text-muted-foreground")}>
                {isSubscribed ? "ON" : "OFF"}
              </span>
            )}
          </span>
        </SidebarLink>
      ) : null}

      <hr className='my-3 border-t' />

      <SidebarLink href='/' isActive={false} onNavigate={onNavigate}>
        <Compass className='size-4' />
        Pay Explorer
      </SidebarLink>
    </nav>
  );
};
