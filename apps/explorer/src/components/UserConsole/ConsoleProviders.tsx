"use client";

import { type PrivyClientConfig, PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/components/shared/Providers";
import { mainnet } from "@/constants/chains";
import { SynapseProvider } from "@/context/Synapse";
import { config, walletChains } from "@/services/wagmi/config";
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
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cmtkfb83p04du0bk0kofldq4e";
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || "client-WY6d6QKpTJMyLAHudjThbGxFZiCsX4oQwkvMVSLRUKmLf";

  return (
    <PrivyProvider appId={appId} clientId={clientId} config={PRIVY_CONFIG}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>
          <SynapseProvider>
            <TopUpActivityProvider>{children}</TopUpActivityProvider>
          </SynapseProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
};

export default ConsoleProviders;
