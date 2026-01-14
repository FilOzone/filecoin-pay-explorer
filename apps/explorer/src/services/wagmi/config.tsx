import { http } from "viem";
import { createConfig } from "wagmi";
import { calibration, mainnet } from "@/constants/chains";

export const supportedChains = [mainnet, calibration] as const;

export const config = createConfig({
  chains: supportedChains,
  transports: {
    [calibration.id]: http(),
    [mainnet.id]: http(),
  },
});
