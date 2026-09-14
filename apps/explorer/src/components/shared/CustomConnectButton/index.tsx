"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useConnectWallet, useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import { toast } from "sonner";
import { useConnection } from "wagmi";
import { consoleWalletSelector } from "@/components/UserConsole/console-wallet";
import { getWalletEntryState, isUserCancelledFlow } from "./state";
import { useWalletExit } from "./useWalletExit";

const describeError = (error: unknown) => (error instanceof Error ? error.message : undefined);

const CustomConnectButton = () => {
  const { ready, authenticated, error } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const { isConnected } = useConnection();
  const { login } = useLogin({
    onError: (code) => {
      if (isUserCancelledFlow(code)) return;
      toast.error("Unable to log in", { description: code });
    },
  });
  const { connectWallet } = useConnectWallet({
    onError: (code) => {
      if (isUserCancelledFlow(code)) return;
      toast.error("Unable to connect wallet", { description: code });
    },
  });
  const { exit } = useWalletExit();
  const state = getWalletEntryState({ ready, walletsReady, authenticated, isConnected });

  if (error) {
    console.error("Privy failed to initialize", error);
    return <p role='alert'>Wallet login is temporarily unavailable. Reload the page and try again.</p>;
  }
  if (state === "connected") return null;
  if (state === "loading") return <p role='status'>Loading wallet…</p>;
  if (state === "preparing")
    return (
      <div className='flex flex-col items-center gap-2'>
        <p role='status'>Preparing wallet…</p>
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
          Log out and try again
        </Button>
      </div>
    );

  return (
    <div className='flex flex-col items-center gap-2'>
      <Button
        variant='primary'
        onClick={() => {
          consoleWalletSelector.resume();
          login();
        }}
        type='button'
        size='compact'
      >
        Log in
      </Button>
      <button
        className='text-sm text-primary hover:underline'
        type='button'
        onClick={() => {
          consoleWalletSelector.resume();
          connectWallet();
        }}
      >
        Connect a wallet without an account
      </button>
    </div>
  );
};

export default CustomConnectButton;
