"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useConnectWallet, useLogin, useLogout, usePrivy, useWallets } from "@privy-io/react-auth";
import { toast } from "sonner";
import { useConnection } from "wagmi";
import { consoleWalletSelector } from "@/components/UserConsole/console-wallet";
import { exitWalletSession, getWalletEntryState } from "./state";

const CustomConnectButton = () => {
  const { ready, authenticated, error } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const { isConnected } = useConnection();
  const { login } = useLogin({
    onError: (error) => toast.error("Unable to log in", { description: error }),
  });
  const { connectWallet } = useConnectWallet({
    onError: (error) => toast.error("Unable to connect wallet", { description: error }),
  });
  const { logout } = useLogout();
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
            void exitWalletSession({
              authenticated,
              logout,
              pauseSelection: consoleWalletSelector.pause,
              resumeSelection: consoleWalletSelector.resume,
            }).catch((error) => toast.error("Unable to log out", { description: error.message }))
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
