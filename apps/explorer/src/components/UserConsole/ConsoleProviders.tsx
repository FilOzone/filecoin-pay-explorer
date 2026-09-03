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

/**
 * Stands in for the console on a deploy without a Privy app ID: a readable
 * message instead of Privy's own "invalid app ID" screen, and no throw, so a
 * build without the variable (CI, a preview) still completes.
 */
function PrivyNotConfigured() {
  return (
    <main className='mx-auto max-w-xl p-8 text-sm'>
      <h1 className='text-lg font-semibold'>The console is not configured</h1>
      <p className='mt-2 text-muted-foreground'>
        Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> (and <code>NEXT_PUBLIC_PRIVY_CLIENT_ID</code>) so the console can log
        users in through Privy. The README lists the Privy dashboard settings.
      </p>
    </main>
  );
}

const ConsoleProviders = ({ children }: { children: React.ReactNode }) => {
  if (!PRIVY_APP_ID) return <PrivyNotConfigured />;
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
