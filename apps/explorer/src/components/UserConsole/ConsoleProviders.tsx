import { midnightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { mainnet } from "@/constants/chains";
import { SynapseProvider } from "@/context/Synapse";
import { config } from "@/services/wagmi/config";

const ConsoleProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={config}>
      <RainbowKitProvider
        // Squid source chains (Ethereum, Base, …) live in the wagmi config so the
        // guided top-up flow can switch to and transact on them, but the console
        // itself only supports Filecoin. Without an explicit initialChain,
        // RainbowKit would keep a wallet that is already on one of those chains
        // there at connect time, dead-ending the console in "Unsupported
        // Network". Pinning initialChain restores the pre-Squid behavior of
        // landing every new connection on Filecoin mainnet.
        initialChain={mainnet.id}
        theme={midnightTheme({
          borderRadius: "small",
          fontStack: "system",
        })}
      >
        <SynapseProvider>{children}</SynapseProvider>
      </RainbowKitProvider>
    </WagmiProvider>
  );
};

export default ConsoleProviders;
