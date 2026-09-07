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

  if (error)
    return (
      <p role='alert'>
        Wallet login could not start. Check this deployment&apos;s Privy configuration, then reload the page.
      </p>
    );
  if (state === "connected") return null;
  if (state === "loading") return <p role='status'>Loading wallet…</p>;
  if (state === "preparing")
    return (
      <div className='flex flex-col items-center gap-2'>
        <p role='status'>Preparing wallet…</p>
        <button
          type='button'
          onClick={() =>
            void exit().catch((error: unknown) =>
              toast.error("Unable to log out", { description: describeError(error) }),
            )
          }
          className='text-sm underline underline-offset-2 opacity-70 hover:opacity-100'
        >
          Log out and try again
        </button>
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
        type='button'
        onClick={() => {
          consoleWalletSelector.resume();
          connectWallet();
        }}
        className='text-sm underline underline-offset-2 opacity-70 hover:opacity-100'
      >
        Just connect a wallet
      </button>
    </div>
  );
};

export default CustomConnectButton;
