"use client";
import { cn } from "@filecoin-pay/ui/lib/utils";
import { Bell, BellOff, Compass, KeyRound, Layers, LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useConnection } from "wagmi";
import { useAccountServices } from "@/hooks/useAccountServices";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";
import { useServiceProfiles } from "@/hooks/useServiceProfiles";
import type { Network } from "@/types";
import { getNetworkFromChainId, isNotificationsEligibleNetwork } from "@/utils/network";

type ConsoleSidebarProps = {
  onAddService: () => void;
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

type SidebarServicesProps = {
  accountId: string;
  activeServiceAddress?: string;
  network: Network;
  onAddService: () => void;
  onNavigate?: () => void;
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

const SidebarServices = ({
  accountId,
  activeServiceAddress,
  network,
  onAddService,
  onNavigate,
}: SidebarServicesProps) => {
  const {
    data: servicesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAccountServices(accountId, {
    networkOverride: network,
  });
  const services = servicesData?.pages.flatMap((page) => page.services) ?? [];
  const profileFor = useServiceProfiles(
    services.map((service) => service.operator.address),
    network,
  );

  return (
    <>
      <hr className='my-3 border-t' />

      <p className='mt-3 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground'>Services</p>

      {services.map((service) => {
        const address = service.operator.address;
        const name = profileFor(address).name;

        return (
          <SidebarLink
            key={service.id}
            href={`/console/services/${address}`}
            isActive={activeServiceAddress === address.toLowerCase()}
            onNavigate={onNavigate}
          >
            <Layers className='size-4 shrink-0' />
            <span className='truncate' title={name}>
              {name}
            </span>
          </SidebarLink>
        );
      })}

      {hasNextPage ? (
        <button
          type='button'
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className='cursor-pointer border-l-2 border-transparent py-2 pl-10 text-left text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50'
        >
          {isFetchingNextPage ? "Loading..." : "Load more"}
        </button>
      ) : null}

      <button
        type='button'
        onClick={onAddService}
        className='flex cursor-pointer items-center gap-2.5 border-l-2 border-transparent py-2 pl-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground'
      >
        <Plus className='size-4' />
        Add service
      </button>

      <hr className='my-3 border-t' />
    </>
  );
};

export const ConsoleSidebar = ({ onAddService, onNavigate }: ConsoleSidebarProps) => {
  const pathname = usePathname();
  const { address, chainId } = useConnection();

  const walletNetwork = getNetworkFromChainId(chainId);
  const isNotificationsEligible = isNotificationsEligibleNetwork(walletNetwork);

  // Also read by the console page; React Query dedupes the two subscriptions.
  const { data: notificationStatus } = useNotificationStatus(address);
  const isSubscribed = notificationStatus?.subscribed;

  const isAlertsActive = pathname.startsWith("/console/notifications");
  const isSessionKeysActive = pathname.startsWith("/console/session-keys");
  const isDashboardActive = pathname === "/console";
  const activeServiceAddress = pathname.startsWith("/console/services/")
    ? pathname.split("/")[3]?.toLowerCase()
    : undefined;

  // Chrome (border, responsive visibility) belongs to the caller: this renders
  // both as the desktop column and inside the mobile drawer.
  return (
    <nav aria-label='Console' className='sticky top-4 flex w-48 shrink-0 flex-col gap-1 self-start'>
      <SidebarLink href='/console' isActive={isDashboardActive} onNavigate={onNavigate}>
        <LayoutDashboard className='size-4' />
        Dashboard
      </SidebarLink>

      <SidebarServices
        accountId={address?.toLowerCase() ?? ""}
        activeServiceAddress={activeServiceAddress}
        network={walletNetwork}
        onAddService={onAddService}
        onNavigate={onNavigate}
      />

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

      <SidebarLink href='/console/session-keys' isActive={isSessionKeysActive} onNavigate={onNavigate}>
        <KeyRound className='size-4' />
        Session Keys
      </SidebarLink>

      <hr className='my-3 border-t' />

      <SidebarLink href='/' isActive={false} onNavigate={onNavigate}>
        <Compass className='size-4' />
        Pay Explorer
      </SidebarLink>
    </nav>
  );
};
