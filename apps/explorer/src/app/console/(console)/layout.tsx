"use client";
import { Container } from "@filecoin-foundation/ui-filecoin/Container";
import type { ReactNode } from "react";
import { useConnection } from "wagmi";
import { BetaWarning } from "@/components/UserConsole/BetaWarning";
import { ConsoleHeader } from "@/components/UserConsole/ConsoleHeader";
import { ConsoleNavDrawer } from "@/components/UserConsole/ConsoleNavDrawer";
import ConsoleProviders from "@/components/UserConsole/ConsoleProviders";
import { ConsoleSidebar } from "@/components/UserConsole/ConsoleSidebar";
import { NotConnected, UnsupportedChain } from "@/components/UserConsole/States";
import { useTopUpActivity } from "@/components/UserConsole/TopUpActivityContext";
import { ConsoleContent } from "./ConsoleContent";
import { ConsoleWalletControls } from "./ConsoleWalletControls";
import { type ConsoleAccessState, getConsoleAccessState, getConsoleDisplayAccessState } from "./console-access";

const ConsoleAccessGate = ({ accessState, children }: { accessState: ConsoleAccessState; children: ReactNode }) => {
  switch (accessState) {
    case "not-connected":
      return <NotConnected />;
    case "unsupported-chain":
      return <UnsupportedChain />;
    case "squid-source":
    case "ready":
      return children;
  }
};

const ConsoleShell = ({ children }: { children: ReactNode }) => {
  const { address, isConnected, chainId } = useConnection();
  const { isTopUpActive } = useTopUpActivity();
  const walletAccessState = getConsoleAccessState({
    isConnected,
    hasAddress: Boolean(address),
    chainId,
  });
  const displayAccessState = getConsoleDisplayAccessState(walletAccessState, isTopUpActive);

  return (
    <div className='flex min-h-full flex-col bg-background text-foreground'>
      <ConsoleHeader
        walletControls={
          <ConsoleWalletControls accessState={walletAccessState} chainId={chainId} isTopUpActive={isTopUpActive} />
        }
        navTrigger={displayAccessState === "ready" ? <ConsoleNavDrawer /> : null}
      />

      <div className='flex-1 pt-4 pb-12'>
        <Container>
          <div className='flex flex-col gap-6'>
            {/* BetaWarning sits above the row so it shows on every console page. */}
            <BetaWarning />
            <ConsoleAccessGate accessState={displayAccessState}>
              <ConsoleContent accessState={displayAccessState} sidebar={<ConsoleSidebar />}>
                {children}
              </ConsoleContent>
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
