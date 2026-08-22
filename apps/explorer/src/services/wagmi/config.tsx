import { createConfig } from "wagmi";
import { calibration, mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { chainTransport } from "./transports";

export const supportedChains = [mainnet, calibration] as const;
const walletChains = [calibration, ...SQUID_SOURCE_CHAINS] as const;

export const config = createConfig({
  chains: walletChains,
  ssr: true,
  transports: Object.fromEntries(walletChains.map((chain) => [chain.id, chainTransport(chain.id)])),
});
