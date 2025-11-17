import { http } from "viem";
import { createConfig } from "wagmi";
import { calibration } from "@/constants/chains";

export const supportedChains = [calibration] as const;

export const config = createConfig({
  chains: supportedChains,
  transports: {
    [calibration.id]: http(),
  },
});
