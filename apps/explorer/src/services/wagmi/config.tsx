import { createConfig } from "@privy-io/wagmi";
import { calibration, mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { createChainTransport } from "./transports";

export const supportedChains = [mainnet, calibration] as const;
const walletChains = [calibration, ...SQUID_SOURCE_CHAINS] as const;

// createConfig comes from @privy-io/wagmi (not wagmi) so Privy-managed wallets
// (embedded and external) sync into wagmi's connector state. All wagmi hooks
// behave as before.
export const config = createConfig({
  chains: walletChains,
  ssr: true,
  transports: Object.fromEntries(walletChains.map((chain) => [chain.id, createChainTransport(chain.id)])),
});
