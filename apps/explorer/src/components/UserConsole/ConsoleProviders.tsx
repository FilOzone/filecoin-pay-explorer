import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { SynapseProvider } from "@/context/Synapse";
import { config } from "@/services/wagmi/config";

const ConsoleProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={config}>
      <RainbowKitProvider theme={darkTheme()}>
        <SynapseProvider>{children}</SynapseProvider>
      </RainbowKitProvider>
    </WagmiProvider>
  );
};

export default ConsoleProviders;
