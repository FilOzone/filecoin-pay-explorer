import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { calibration, mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { SynapseProvider } from "@/context/Synapse";
import { config } from "@/services/wagmi/config";
import { createConsoleWalletSelector } from "./console-wallet";
import { FundingLaunchProvider } from "./FundingLaunchContext";
import { readOnrampEnvironment } from "./privy-funding";
import { TopUpActivityProvider } from "./TopUpActivityContext";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
// Module-level so the selection survives re-renders, and stored so it survives
// a reload; see createConsoleWalletSelector. Storage is read lazily, on the client.
const selectConsoleWallet = createConsoleWalletSelector({ storage: () => window.localStorage });

const ConsoleProviders = ({ children }: { children: React.ReactNode }) => {
  if (!PRIVY_APP_ID) {
    // Fail with a clear message instead of booting into an opaque Privy
    // "invalid app ID" error screen on a misconfigured deploy.
    throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is not set; the console cannot initialize Privy without it.");
  }
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID}
      config={{
        loginMethods: ["email", "google", "wallet"],
        // Users who log in with email/social get a wallet created for them;
        // users who bring their own wallet never get a second one.
        //
        // showWalletUIs: false — embedded wallets sign and send silently, with
        // no Privy confirmation modals. This is the standard embedded-wallet
        // UX (the console's own dialogs already narrate each step), and it is
        // also required for correctness here: Privy's confirmation-screen
        // component crashes on this stack (Next 16 + Turbopack + React 19,
        // react-auth 3.38/3.39) with "Cannot destructure property 'method' of
        // '<x>.signMessage'" when it mounts a prompt. The signing engine
        // itself is fine — verified by real depositWithPermit transactions on
        // calibration through the unmodified wagmi signing path.
        embeddedWallets: { showWalletUIs: false, ethereum: { createOnLogin: "users-without-wallets" } },
        // Squid source chains (Ethereum, Base, …) stay available so the guided
        // top-up flow can switch to and transact on them, but the console
        // itself only supports Filecoin. defaultChain pins new sessions to
        // Filecoin mainnet, mirroring the previous RainbowKit initialChain
        // behavior that kept wallets from dead-ending in "Unsupported Network".
        defaultChain: mainnet,
        supportedChains: [mainnet, calibration, ...SQUID_SOURCE_CHAINS],
        appearance: { walletChainType: "ethereum-only" },
        // Card purchases go to the providers' sandboxes when NEXT_PUBLIC_PRIVY_ONRAMP_SANDBOX is set.
        fundingMethodConfig: readOnrampEnvironment() === "sandbox" ? { moonpay: { useSandbox: true } } : undefined,
      }}
    >
      {/* Pins wagmi's active wallet to the console identity so connecting a
          second wallet (to fund this one) never switches accounts. */}
      <WagmiProvider config={config} setActiveWalletForWagmi={selectConsoleWallet}>
        <SynapseProvider>
          <TopUpActivityProvider>
            <FundingLaunchProvider>{children}</FundingLaunchProvider>
          </TopUpActivityProvider>
        </SynapseProvider>
      </WagmiProvider>
    </PrivyProvider>
  );
};

export default ConsoleProviders;
