"use client";

import { type PrivyClientConfig, PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet, WagmiProvider } from "@privy-io/wagmi";
import { useEffect } from "react";
import { useConnection } from "wagmi";
import { mainnet } from "@/constants/chains";
import { SynapseProvider } from "@/context/Synapse";
import { config } from "@/services/wagmi/config";
import { isLinkedWallet, selectConsoleWallet } from "./console-wallet";
import { FundingLaunchProvider } from "./FundingLaunchContext";
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

export const PRIVY_DEVELOPMENT_APP = {
  appId: "cmtkfb83p04du0bk0kofldq4e",
  clientId: "client-WY6d6QKpTJMyLAHudjThbGxFZiCsX4oQwkvMVSLRUKmLf",
} as const;

// A reconnect that started before the selection can land after it, so wagmi is put back on the selected wallet.
// A wallet's Privy login ends once the console follows the extension to an account that login doesn't own.
export function KeepConsoleWallet() {
  const { wallets } = useWallets();
  const { authenticated, user, logout } = usePrivy();
  const { address } = useConnection();
  const { setActiveWallet } = useSetActiveWallet();
  const selected = selectConsoleWallet({ wallets });

  useEffect(() => {
    if (selected && address && selected.address.toLowerCase() !== address.toLowerCase()) void setActiveWallet(selected);
  }, [selected, address, setActiveWallet]);

  const walletOnlyLogin = user?.linkedAccounts.every((account) => account.type === "wallet") ?? false;
  useEffect(() => {
    if (authenticated && walletOnlyLogin && address && !isLinkedWallet(user, address)) void logout();
  }, [authenticated, walletOnlyLogin, user, address, logout]);

  return null;
}

const ConsoleProviders = ({ children }: { children: React.ReactNode }) => {
  const configuredAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  const configuredClientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID?.trim();
  const privyApp =
    configuredAppId && configuredClientId
      ? { appId: configuredAppId, clientId: configuredClientId }
      : PRIVY_DEVELOPMENT_APP;

  return (
    <PrivyProvider {...privyApp} config={PRIVY_CONFIG}>
      <WagmiProvider config={config} setActiveWalletForWagmi={selectConsoleWallet}>
        <KeepConsoleWallet />
        <SynapseProvider>
          <TopUpActivityProvider>
            <FundingLaunchProvider>{children}</FundingLaunchProvider>
          </TopUpActivityProvider>
        </SynapseProvider>
      </WagmiProvider>
    </PrivyProvider>
  );
};

export default ConsoleProviders;
