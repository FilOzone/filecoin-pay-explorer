"use client";

import { type PrivyClientConfig, PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/components/shared/Providers";
import { mainnet } from "@/constants/chains";
import { SynapseProvider } from "@/context/Synapse";
import { config, walletChains } from "@/services/wagmi/config";
import { consoleWalletSelector } from "./console-wallet";
import { FundingLaunchProvider } from "./FundingLaunchContext";
import { TopUpActivityProvider } from "./TopUpActivityContext";

export const PRIVY_CONFIG = {
  loginMethods: ["email", "google", "wallet"],
  embeddedWallets: {
    showWalletUIs: true,
    ethereum: { createOnLogin: "users-without-wallets" },
  },
  defaultChain: mainnet,
  supportedChains: [...walletChains],
  appearance: { walletChainType: "ethereum-only" },
} satisfies PrivyClientConfig;

const ConsoleProviders = ({ children }: { children: React.ReactNode }) => {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;

  if (!appId || !clientId) {
    return (
      <div role='alert' className='m-6 rounded-md border border-red-300 bg-red-50 p-4 text-red-900'>
        Console wallet login is not configured. Set NEXT_PUBLIC_PRIVY_APP_ID and NEXT_PUBLIC_PRIVY_CLIENT_ID.
      </div>
    );
  }

  return (
    <PrivyProvider appId={appId} clientId={clientId} config={PRIVY_CONFIG}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config} setActiveWalletForWagmi={consoleWalletSelector}>
          <SynapseProvider>
            <TopUpActivityProvider>
              <FundingLaunchProvider>{children}</FundingLaunchProvider>
            </TopUpActivityProvider>
          </SynapseProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
};

export default ConsoleProviders;
