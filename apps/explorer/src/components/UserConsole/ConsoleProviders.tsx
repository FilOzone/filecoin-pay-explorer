import { midnightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import WalletProviders from "@/components/shared/WalletProviders";
import { SynapseProvider } from "@/context/Synapse";

const ConsoleProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <WalletProviders>
      <RainbowKitProvider
        theme={midnightTheme({
          borderRadius: "small",
          fontStack: "system",
        })}
      >
        <SynapseProvider>{children}</SynapseProvider>
      </RainbowKitProvider>
    </WalletProviders>
  );
};

export default ConsoleProviders;
