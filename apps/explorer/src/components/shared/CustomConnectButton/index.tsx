"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useConnectWallet, useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import { toast } from "sonner";
import { useConsoleAccount } from "@/components/UserConsole/providers/ConsoleAccountContext";
import { getWalletEntryState, isUserCancelledFlow } from "./state";
import { useWalletExit } from "./useWalletExit";

const describeError = (error: unknown) => (error instanceof Error ? error.message : undefined);

const CustomConnectButton = () => {
  const { ready, authenticated, error } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const { selectAccount } = useConsoleAccount();
  // An email or Google login needs no callback: the console account follows the Privy session.
  const { login } = useLogin({
    onError: (code) => {
      if (isUserCancelledFlow(code)) return;
      toast.error("Unable to log in", { description: code });
    },
  });
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => selectAccount(wallet),
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
    <div className='flex w-full max-w-md flex-col gap-3 text-left'>
      <div className='rounded-lg border border-primary/30 bg-primary/5 p-4'>
        <div className='mb-2 flex items-center justify-between gap-3'>
          <h3 className='font-medium'>Email or Google</h3>
          <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'>New to crypto</span>
        </div>
        <p className='mb-4 text-sm text-muted-foreground'>
          We’ll create a Filecoin Pay wallet if you don’t have one yet.
        </p>
        <Button
          className='w-full'
          variant='primary'
          onClick={() => login({ loginMethods: ["email", "google"] })}
          type='button'
        >
          Continue with a Filecoin Pay wallet
        </Button>
      </div>

      <div className='flex items-center gap-3 text-xs text-muted-foreground' aria-hidden='true'>
        <span className='h-px flex-1 bg-border' />
        or
        <span className='h-px flex-1 bg-border' />
      </div>

      <div className='rounded-lg border p-4'>
        <h3 className='mb-2 font-medium'>Existing crypto wallet</h3>
        <p className='mb-4 text-sm text-muted-foreground'>
          Use MetaMask or another wallet you already control. No sign-up needed. Card payments need a one-time
          signature.
        </p>
        <Button className='w-full' variant='ghost' type='button' onClick={() => connectWallet()}>
          Connect existing wallet
        </Button>
      </div>
    </div>
  );
};

export default CustomConnectButton;
