"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Button as ActionButton } from "@filecoin-pay/ui/components/button";
import { useConnectWallet, useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import { ArrowRight, Mail, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useConsoleAccount } from "@/components/UserConsole/providers/ConsoleAccountContext";
import { trackWalletConnected } from "@/utils/funnel-analytics";
import { getWalletEntryState, isUserCancelledFlow } from "./state";
import { useWalletExit } from "./useWalletExit";

const describeError = (error: unknown) => (error instanceof Error ? error.message : undefined);
const signInButtonClassName =
  "h-auto min-h-14 w-full justify-start gap-3 rounded-xl px-4 py-3 text-left text-base font-semibold whitespace-normal has-[>svg]:px-4";

const CustomConnectButton = () => {
  const { ready, authenticated, error } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const { selectAccount } = useConsoleAccount();
  // An email or Google login needs no callback: the console account follows the Privy session.
  const { login } = useLogin({
    onComplete: ({ isNewUser, wasAlreadyAuthenticated }) => {
      if (!wasAlreadyAuthenticated) trackWalletConnected("embedded", isNewUser);
    },
    onError: (code) => {
      if (isUserCancelledFlow(code)) return;
      toast.error("Unable to log in", { description: code });
    },
  });
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      selectAccount(wallet);
      trackWalletConnected("external");
    },
    onError: (code) => {
      if (isUserCancelledFlow(code)) return;
      toast.error("Unable to connect wallet", { description: code });
    },
  });
  const { exit } = useWalletExit();
  const state = getWalletEntryState({ ready, walletsReady, authenticated });

  if (error) {
    console.error("Privy failed to initialize", error);
    return <p role='alert'>Wallet login is temporarily unavailable. Reload the page and try again.</p>;
  }
  if (state === "loading") return <p role='status'>Loading wallet…</p>;
  // The NotConnected card already titles this state, so the button offers only the exits.
  if (state === "preparing")
    return (
      <div className='flex items-center gap-2'>
        <Button variant='ghost' size='compact' type='button' onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Button
          variant='ghost'
          size='compact'
          type='button'
          onClick={() =>
            void exit().catch((error: unknown) =>
              toast.error("Unable to log out", { description: describeError(error) }),
            )
          }
        >
          Log out
        </Button>
      </div>
    );

  return (
    <div className='grid gap-5'>
      <div>
        <ActionButton
          className={signInButtonClassName}
          aria-describedby='email-wallet-description'
          onClick={() => login({ loginMethods: ["email", "google"] })}
          type='button'
        >
          <Mail aria-hidden='true' className='size-5' />
          Continue with email or Google
          <ArrowRight aria-hidden='true' className='ml-auto hidden size-4 @sm:block' />
        </ActionButton>
        <p id='email-wallet-description' className='mt-2 px-1 text-sm leading-relaxed text-muted-foreground'>
          New here? We’ll create your wallet when you sign in.
        </p>
      </div>
      <div>
        <ActionButton
          className={signInButtonClassName}
          variant='outline'
          type='button'
          aria-describedby='existing-wallet-description'
          onClick={() => connectWallet()}
        >
          <Wallet aria-hidden='true' className='size-5' />
          Connect existing wallet
          <ArrowRight aria-hidden='true' className='ml-auto hidden size-4 @sm:block' />
        </ActionButton>
        <p id='existing-wallet-description' className='mt-2 px-1 text-sm leading-relaxed text-muted-foreground'>
          Use MetaMask or another wallet you own. Card payments need a one-time signature.
        </p>
      </div>
    </div>
  );
};

export default CustomConnectButton;
