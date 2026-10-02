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
  // A login needs no callback: the console account follows the Privy session.
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
    <div className='flex flex-col items-center gap-2'>
      <Button variant='primary' onClick={() => login()} type='button' size='compact'>
        Log in
      </Button>
      <button className='text-sm text-primary hover:underline' type='button' onClick={() => connectWallet()}>
        Connect a wallet without an account
      </button>
    </div>
  );
};

export default CustomConnectButton;
