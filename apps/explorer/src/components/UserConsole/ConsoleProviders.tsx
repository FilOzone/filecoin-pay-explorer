"use client";

import { Alert } from "@filecoin-foundation/ui-filecoin/Alert";
import { type PrivyClientConfig, PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { mainnet } from "@/constants/chains";
import { SynapseProvider } from "@/context/Synapse";
import { config } from "@/services/wagmi/config";
import { consoleWalletSelector } from "./console-wallet";
import { TopUpActivityProvider } from "./TopUpActivityContext";

export const PRIVY_CONFIG = {
  loginMethods: ["email", "google", "wallet"],
  embeddedWallets: {
    showWalletUIs: true,
    ethereum: { createOnLogin: "users-without-wallets" },
  },
  defaultChain: mainnet,
  supportedChains: [...config.chains],
  appearance: { walletChainType: "ethereum-only" },
} satisfies PrivyClientConfig;

const ConsoleProviders = ({ children }: { children: React.ReactNode }) => {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;

  if (!appId || !clientId) {
    const missingVariables = [!appId && "NEXT_PUBLIC_PRIVY_APP_ID", !clientId && "NEXT_PUBLIC_PRIVY_CLIENT_ID"].filter(
      Boolean,
    );
    console.error("Wallet login is unavailable: missing environment variables", missingVariables);

    return (
      <div className='m-6'>
        <Alert title='Wallet login is temporarily unavailable' description='Please try again later.' />
      </div>
    );
  }

  return (
    <PrivyProvider appId={appId} clientId={clientId} config={PRIVY_CONFIG}>
      <WagmiProvider config={config} setActiveWalletForWagmi={consoleWalletSelector}>
        <SynapseProvider>
          <TopUpActivityProvider>{children}</TopUpActivityProvider>
        </SynapseProvider>
      </WagmiProvider>
    </PrivyProvider>
  );
};

export default ConsoleProviders;
