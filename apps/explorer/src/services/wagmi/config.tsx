import { http } from "viem";
import { filecoin, filecoinCalibration } from "viem/chains";
import { createConfig } from "wagmi";

export const supportedChains = [filecoinCalibration, filecoin] as const;

export const config = createConfig({
  chains: supportedChains,
  transports: {
    [filecoinCalibration.id]: http(),
    [filecoin.id]: http(),
  },
});
