import { createConfig } from "@privy-io/wagmi";
import { calibration, devnet, mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { createChainTransport } from "./transports";

/** The networks the explorer's network switcher offers: never the devnet. */
export const publicChains = [mainnet, calibration] as const;
/** Every network the app serves: the public ones, plus a local foc-devnet in development (see devnet). */
export const supportedChains = devnet ? [...publicChains, devnet] : publicChains;
const walletChains = [calibration, ...(devnet ? [devnet] : []), ...SQUID_SOURCE_CHAINS] as const;

export const config = createConfig({
  chains: walletChains,
  ssr: true,
  transports: Object.fromEntries(walletChains.map((chain) => [chain.id, createChainTransport(chain.id)])),
});
