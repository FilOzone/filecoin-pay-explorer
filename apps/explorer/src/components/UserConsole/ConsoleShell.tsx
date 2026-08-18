"use client";

import { Container } from "@filecoin-foundation/ui-filecoin/Container";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { Section } from "@filecoin-foundation/ui-filecoin/Section/Section";
import { AlertTriangle } from "lucide-react";
import { useConnection } from "wagmi";
import { Balance, ChainSwitcher, CustomConnectButton } from "@/components/shared";
import { HomeLogoIconLink } from "@/components/shared/Navigation/components/HomeLogoIconLink";
import { BetaWarning } from "@/components/UserConsole";
import { isSupportedChainId } from "@/utils/network";
import ConsoleSidebar from "./ConsoleSidebar";

// Account-area chrome: own top bar (logo + chain switcher + wallet chip in the
// same top-right position as the explorer's network selector), beta banner, and
// section sidebar. Replaces the explorer navigation on /console routes.
const ConsoleShell = ({ children }: { children: React.ReactNode }) => {
  const { isConnected, chainId } = useConnection();
  const isUnsupportedChain = isConnected && chainId !== undefined && !isSupportedChainId(chainId);

  return (
    <>
      <Section as='header' backgroundVariant='light'>
        <Container>
          <div className='flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between'>
            <HomeLogoIconLink />
            <div className='flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-4'>
              {!isConnected && <CustomConnectButton />}
              {isConnected && isUnsupportedChain && (
                <span className='inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700'>
                  <AlertTriangle className='size-4' />
                  Unsupported Network
                </span>
              )}
              {isConnected && !isUnsupportedChain && (
                <>
                  {chainId !== undefined && <ChainSwitcher chainId={chainId} />}
                  <Balance />
                </>
              )}
            </div>
          </div>
        </Container>
      </Section>

      <PageSection backgroundVariant='light'>
        <div className='flex flex-col gap-10 -mt-15'>
          <BetaWarning />
          <div className='flex flex-col gap-8 lg:flex-row lg:gap-12'>
            <ConsoleSidebar />
            <div className='min-w-0 flex-1'>{children}</div>
          </div>
        </div>
      </PageSection>
    </>
  );
};

export default ConsoleShell;
