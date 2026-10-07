"use client";

import { type PrivyClientConfig, PrivyProvider } from "@privy-io/react-auth";
import { mainnet } from "@/constants/chains";
import { SynapseProvider } from "@/context/Synapse";
import { config } from "@/services/wagmi/config";
import { ConsoleAccountProvider } from "./ConsoleAccountContext";
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

/**
 * Local runs, tests and preview deployments fall back to the development app (#443). A production deployment must
 * name its own: falling back there would sign real users in to the development app, so it fails instead and names
 * what is missing, never the configured values.
 */
export function resolvePrivyApp({
  appId,
  clientId,
  deployment,
}: {
  appId: string | undefined;
  clientId: string | undefined;
  /** Vercel's deployment environment: "production", "preview" or "development"; unset off Vercel. */
  deployment: string | undefined;
}): { appId: string; clientId: string } {
  const configured = { appId: appId?.trim(), clientId: clientId?.trim() };
  if (configured.appId && configured.clientId) return { appId: configured.appId, clientId: configured.clientId };
  if (deployment !== "production") return PRIVY_DEVELOPMENT_APP;

  const missing = [
    ...(configured.appId ? [] : ["NEXT_PUBLIC_PRIVY_APP_ID"]),
    ...(configured.clientId ? [] : ["NEXT_PUBLIC_PRIVY_CLIENT_ID"]),
  ];
  throw new Error(`A production deployment needs its own Privy app: set ${missing.join(" and ")}.`);
}

const ConsoleProviders = ({ children }: { children: React.ReactNode }) => {
  const privyApp = resolvePrivyApp({
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    clientId: process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID,
    deployment: process.env.NEXT_PUBLIC_VERCEL_ENV,
  });

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
