import { http } from "viem";
import { filecoinCalibration } from "viem/chains";
import { createConfig } from "wagmi";

export const supportedChains = [filecoinCalibration] as const;

export const config = createConfig({
  chains: supportedChains,
  transports: {
    [filecoinCalibration.id]: http(),
  },
});
