"use client";
import { Container } from "@filecoin-foundation/ui-filecoin/Container";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useConnection } from "wagmi";
import Balance from "@/components/shared/Balance";
import ChainSwitcher from "@/components/shared/ChainSwitcher";
import { BetaWarning } from "@/components/UserConsole/BetaWarning";
import { ConsoleHeader } from "@/components/UserConsole/ConsoleHeader";
import { ConsoleNavDrawer } from "@/components/UserConsole/ConsoleNavDrawer";
import ConsoleProviders from "@/components/UserConsole/ConsoleProviders";
import { ConsoleSidebar } from "@/components/UserConsole/ConsoleSidebar";
import { NotConnected, UnsupportedChain } from "@/components/UserConsole/States";
import { isSupportedChainId } from "@/utils/network";

type ConsoleAccessState = "not-connected" | "unsupported-chain" | "ready";

const getConsoleAccessState = ({
  isConnected,
  hasAddress,
  chainId,
}: {
  isConnected: boolean;
  hasAddress: boolean;
  chainId: number | undefined;
}): ConsoleAccessState => {
  if (!isConnected || !hasAddress) {
    return "not-connected";
  }

  if (chainId !== undefined && !isSupportedChainId(chainId)) {
    return "unsupported-chain";
  }

  return "ready";
};

const ConsoleWalletControls = ({
  accessState,
  chainId,
}: {
  accessState: ConsoleAccessState;
  chainId: number | undefined;
}) => {
  switch (accessState) {
    case "not-connected":
      return null;
    case "unsupported-chain":
      return (
        <span className='inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700'>
          <AlertTriangle className='size-4' />
          Unsupported Network
        </span>
      );
    case "ready":
      return (
        <>
          <Balance />
          {chainId !== undefined ? <ChainSwitcher chainId={chainId} /> : null}
        </>
      );
  }
};

const ConsoleAccessGate = ({ accessState, children }: { accessState: ConsoleAccessState; children: ReactNode }) => {
  switch (accessState) {
    case "not-connected":
      return <NotConnected />;
    case "unsupported-chain":
      return <UnsupportedChain />;
    case "ready":
      return children;
  }
};

const ConsoleShell = ({ children }: { children: ReactNode }) => {
  const { address, isConnected, chainId } = useConnection();
  const accessState = getConsoleAccessState({
    isConnected,
    hasAddress: Boolean(address),
    chainId,
  });

  return (
    <div className='flex min-h-full flex-col bg-background text-foreground'>
      <ConsoleHeader
        walletControls={<ConsoleWalletControls accessState={accessState} chainId={chainId} />}
        navTrigger={accessState === "ready" ? <ConsoleNavDrawer /> : null}
      />

      <div className='flex-1 pt-4 pb-12'>
        <Container>
          <div className='flex flex-col gap-15'>
            {/* BetaWarning sits above the row so it shows on every console page. */}
            <BetaWarning />
            <ConsoleAccessGate accessState={accessState}>
              <div className='flex gap-8'>
                {/* Exact complement of the drawer trigger's `lg:hidden`. */}
                <div className='hidden border-r pr-4 lg:flex'>
                  <ConsoleSidebar />
                </div>
                <div className='min-w-0 flex-1'>{children}</div>
              </div>
            </ConsoleAccessGate>
          </div>
        </Container>
      </div>
    </div>
  );
};

// Kept separate from ConsoleShell: a component can't mount a provider and read from it.
const ConsoleLayout = ({ children }: { children: ReactNode }) => (
  <ConsoleProviders>
    <ConsoleShell>{children}</ConsoleShell>
  </ConsoleProviders>
);

export default ConsoleLayout;
