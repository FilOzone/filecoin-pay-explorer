"use client";
import { Sheet, SheetContent } from "@filecoin-pay/ui/components/sheet";
import { AlertTriangle, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { Balance, ChainSwitcher } from "@/components/shared";
import { BetaWarning } from "@/components/UserConsole";
import ConsoleProviders from "@/components/UserConsole/ConsoleProviders";
import { ConsoleSidebar, type ConsoleTab } from "@/components/UserConsole/ConsoleSidebar";
import { NotConnected, UnsupportedChain } from "@/components/UserConsole/States";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";
import LogoDark from "@/public/foc-logo-dark.svg";
import { getNetworkFromChainId, isNotificationsEligibleNetwork, isSupportedChainId } from "@/utils/network";

function pathnameToTab(pathname: string): ConsoleTab {
  if (pathname === "/console/authorizations") return "authorizations";
  if (pathname.startsWith("/console/notifications")) return "notifications";
  return "dashboard";
}

const ConsoleLayoutContent = ({ children }: { children: React.ReactNode }) => {
  const { address, isConnected, chainId } = useConnection();
  const pathname = usePathname();
  const router = useRouter();
  const walletNetwork = useMemo(() => getNetworkFromChainId(chainId), [chainId]);
  const isUnsupportedChain = isConnected && chainId && !isSupportedChainId(chainId);
  const isNotificationsEligible = isNotificationsEligibleNetwork(walletNetwork);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: notificationStatus } = useNotificationStatus(address);
  const subscribed = notificationStatus?.subscribed ?? false;

  const activeTab = pathnameToTab(pathname);

  const handleTabChange = (tab: ConsoleTab) => {
    if (tab === "dashboard") router.push("/console");
    else if (tab === "authorizations") router.push("/console/authorizations");
  };

  const sidebarProps = {
    activeTab,
    onTabChange: handleTabChange,
    subscribed,
    isNotificationsEligible,
  };

  return (
    <div className='flex flex-col min-h-screen bg-background text-foreground'>
      {/* Top bar */}
      <header className='sticky top-0 z-10 bg-background'>
        <div className='mx-auto max-w-[1440px] px-6 md:px-15 py-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
          {/* Logo row — on mobile also holds the hamburger */}
          <div className='flex items-center justify-between'>
            <Link href='/' aria-label='Go to Pay Explorer'>
              <LogoDark height={40} />
            </Link>
            {isConnected && !isUnsupportedChain && (
              <button
                type='button'
                className='md:hidden p-1 -mr-1 text-muted-foreground hover:text-foreground transition-colors'
                onClick={() => setMobileMenuOpen(true)}
                aria-label='Open menu'
              >
                <Menu className='size-6' />
              </button>
            )}
          </div>

          {/* Chain + wallet — on tablet also holds the hamburger */}
          {isConnected && (
            <div className='flex items-center gap-3 w-full md:w-auto'>
              {isUnsupportedChain ? (
                <span className='inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700'>
                  <AlertTriangle className='size-4' />
                  Unsupported Network
                </span>
              ) : (
                <>
                  <div className='flex flex-col gap-1 md:flex-row md:items-center md:gap-3 flex-1 md:flex-none [&>*]:w-full md:[&>*]:w-auto'>
                    {chainId && <ChainSwitcher chainId={chainId} />}
                    <Balance />
                  </div>
                  <button
                    type='button'
                    className='hidden md:block lg:hidden p-1 -mr-1 text-muted-foreground hover:text-foreground transition-colors'
                    onClick={() => setMobileMenuOpen(true)}
                    aria-label='Open menu'
                  >
                    <Menu className='size-6' />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Mobile sidebar sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side='right' className='w-64 pt-10 px-0'>
          <ConsoleSidebar
            {...sidebarProps}
            onNavigate={() => setMobileMenuOpen(false)}
            className='flex flex-col gap-4 px-4'
          />
        </SheetContent>
      </Sheet>

      {/* Page content */}
      <div className='flex-1 flex flex-col gap-8 mx-auto w-full max-w-[1440px] px-6 md:px-15 pt-4 pb-8'>
        <BetaWarning />

        {(!isConnected || !address) && <NotConnected />}
        {isUnsupportedChain && <UnsupportedChain />}

        {isConnected && !isUnsupportedChain && (
          <div className='flex gap-8'>
            <ConsoleSidebar {...sidebarProps} />
            <div className='flex-1 min-w-0 flex flex-col gap-15'>{children}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleProviders>
      <ConsoleLayoutContent>{children}</ConsoleLayoutContent>
    </ConsoleProviders>
  );
}
