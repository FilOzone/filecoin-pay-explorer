"use client";

import { WagmiProvider } from "wagmi";
import { config } from "@/services/wagmi/config";

// Wagmi context on its own, without RainbowKit or Synapse. Lets lightweight
// consumers (e.g. the header account button) read wallet state on every page
// while the full console stack stays scoped to console routes.
const WalletProviders = ({ children }: { children: React.ReactNode }) => {
  return <WagmiProvider config={config}>{children}</WagmiProvider>;
};

export default WalletProviders;
