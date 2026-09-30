"use client";

import { type PrivyClientConfig, PrivyProvider } from "@privy-io/react-auth";
import { mainnet } from "@/constants/chains";
import { SynapseProvider } from "@/context/Synapse";
import { config } from "@/services/wagmi/config";
import { FundingLaunchProvider } from "../FundingLaunchContext";
import { TopUpActivityProvider } from "../TopUpActivityContext";
import { ConsoleAccountProvider } from "./ConsoleAccountContext";

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

export const PRIVY_DEVELOPMENT_APP = {
  appId: "cmtkfb83p04du0bk0kofldq4e",
  clientId: "client-WY6d6QKpTJMyLAHudjThbGxFZiCsX4oQwkvMVSLRUKmLf",
} as const;

const ConsoleProviders = ({ children }: { children: React.ReactNode }) => {
  const configuredAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  const configuredClientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID?.trim();
  const privyApp =
    configuredAppId && configuredClientId
      ? { appId: configuredAppId, clientId: configuredClientId }
      : PRIVY_DEVELOPMENT_APP;

  return (
    <PrivyProvider {...privyApp} config={PRIVY_CONFIG}>
      <ConsoleAccountProvider>
        <SynapseProvider>
          <TopUpActivityProvider>
            <FundingLaunchProvider>{children}</FundingLaunchProvider>
          </TopUpActivityProvider>
        </SynapseProvider>
      </ConsoleAccountProvider>
    </PrivyProvider>
  );
};

export default ConsoleProviders;
