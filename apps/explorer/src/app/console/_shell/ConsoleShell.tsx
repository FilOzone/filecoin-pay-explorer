"use client";
import { Container } from "@filecoin-foundation/ui-filecoin/Container";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import clsx from "clsx";
import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { useConnection } from "wagmi";
import { BetaWarning } from "@/components/UserConsole/BetaWarning";
import { ConsoleHeader } from "@/components/UserConsole/ConsoleHeader";
import { ConsoleNavDrawer } from "@/components/UserConsole/ConsoleNavDrawer";
import { ConsoleSidebar } from "@/components/UserConsole/ConsoleSidebar";
import { FundingHost } from "@/components/UserConsole/FundingHost";
import { useConsoleAccount } from "@/components/UserConsole/providers/ConsoleAccountContext";
import { useTopUpActivity } from "@/components/UserConsole/providers/TopUpActivityContext";
import { AccountUnavailable, ConnectingWallet, NotConnected, UnsupportedChain } from "@/components/UserConsole/States";
import { useConsoleNetwork } from "@/components/UserConsole/useConsoleNetwork";
import { trackConsoleView } from "@/utils/funnel-analytics";
import { ConsoleWalletControls } from "./ConsoleWalletControls";
import {
  type ConsoleAccessState,
  getConsoleAccessState,
  getConsoleAccountState,
  getConsoleDisplayAccessState,
  keepReadyThroughResync,
  type ReadyConnection,
  rememberReadyConnection,
} from "./console-access";

const AddServiceDialog = dynamic(() => import("@/components/UserConsole/AddServiceDialog"));

const ConsoleAccessGate = ({ accessState, children }: { accessState: ConsoleAccessState; children: ReactNode }) => {
  switch (accessState) {
    case "reconnecting":
      return <ConnectingWallet />;
    case "not-connected":
      return <NotConnected />;
    case "account-unavailable":
      return <AccountUnavailable />;
    case "unsupported-chain":
    // A Squid source chain only reaches here with no top-up in progress:
    // getConsoleDisplayAccessState reports an active one as "ready".
    case "squid-source":
      return <UnsupportedChain />;
    case "ready":
      return children;
  }
};

/**
 * The console chrome: header, wallet access gate and funding dialogs.
 * `focused` drops the sidebar and navigation for a page that does one job,
 * like a link's setup request, and narrows it to a single column. Its
 * `intro` says what that job is while the wallet gate stands in for the page.
 */
export const ConsoleShell = ({
  children,
  focused = false,
  intro,
}: {
  children: ReactNode;
  focused?: boolean;
  intro?: ReactNode;
}) => {
  const [isAddServiceOpen, setIsAddServiceOpen] = useState(false);
  const { network } = useConsoleNetwork();
  const { address, isConnected, isReconnecting, chainId } = useConnection();
  const { account } = useConsoleAccount();
  const { ready: walletsReady, wallets } = useWallets();
  const { error: privyError } = usePrivy();
  const { isTopUpActive } = useTopUpActivity();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [lastReady, setLastReady] = useState<ReadyConnection | null>(null);
  const accountState = getConsoleAccountState({
    account,
    address,
    hydrated,
    privyFailed: Boolean(privyError),
    wallets,
    walletsReady,
  });
  const walletAccessState = keepReadyThroughResync(
    getConsoleAccessState({ accountState, isConnected, isReconnecting, hasAddress: Boolean(address), chainId }),
    accountState,
    lastReady,
    address,
    chainId,
    isTopUpActive,
  );
  useEffect(() => {
    trackConsoleView();
  }, []);
  useEffect(() => {
    setLastReady((previous) => rememberReadyConnection(walletAccessState, address, chainId, previous));
  }, [walletAccessState, address, chainId]);
  const displayAccessState = getConsoleDisplayAccessState(walletAccessState, isTopUpActive);

  return (
    <div className='flex min-h-full flex-col bg-background text-foreground'>
      <ConsoleHeader
        walletControls={
          <ConsoleWalletControls accessState={walletAccessState} chainId={chainId} isTopUpActive={isTopUpActive} />
        }
        navTrigger={
          displayAccessState === "ready" && !focused ? (
            <ConsoleNavDrawer onAddService={() => setIsAddServiceOpen(true)} />
          ) : null
        }
      />

      <div className='flex-1 pt-4 pb-12'>
        <Container>
          <div className={clsx("flex flex-col gap-6", focused && "mx-auto w-full max-w-2xl")}>
            {/* BetaWarning sits above the row so it shows on every console page. */}
            <BetaWarning />
            {displayAccessState !== "ready" && intro}
            <ConsoleAccessGate accessState={displayAccessState}>
              {/* Keyed by account, so nothing started for one account survives a switch to another. */}
              {focused ? (
                <div key={account?.address}>{children}</div>
              ) : (
                <div key={account?.address} className='flex gap-8'>
                  <div className='hidden border-r pr-4 lg:flex'>
                    <ConsoleSidebar onAddService={() => setIsAddServiceOpen(true)} />
                  </div>
                  <div className='min-w-0 flex-1'>{children}</div>
                </div>
              )}
            </ConsoleAccessGate>
            {/* Funding dialogs read the wagmi address, so they mount only while it is the console account. */}
            {accountState === "active" ? <FundingHost /> : null}
            {isAddServiceOpen ? <AddServiceDialog network={network} open onOpenChange={setIsAddServiceOpen} /> : null}
          </div>
        </Container>
      </div>
    </div>
  );
};
