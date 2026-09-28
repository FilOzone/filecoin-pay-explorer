"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import {
  type LinkedAccountWithMetadata,
  useConnectWallet,
  useLogin,
  usePrivy,
  useWallets,
  type WalletWithMetadata,
} from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useConnection, useConnectors } from "wagmi";
import { useActiveWalletGuard } from "@/components/UserConsole/ActiveWalletGuardContext";
import { getWalletEntryState, isUserCancelledFlow } from "./state";
import { useWalletExit } from "./useWalletExit";

const describeError = (error: unknown) => (error instanceof Error ? error.message : undefined);

const isEmbeddedWalletAccount = (account: LinkedAccountWithMetadata): account is WalletWithMetadata =>
  account.type === "wallet" && account.walletClientType === "privy";

const CustomConnectButton = () => {
  const { ready, authenticated, error } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { address, isConnected } = useConnection();
  // Privy registers connectors after reporting wallets, so connector changes retry activation.
  const connectors = useConnectors();
  const { setActiveWallet } = useSetActiveWallet();
  const { confirmActive, isExiting } = useActiveWalletGuard();
  const [pendingActivation, setPendingActivation] = useState<string>();

  // setActiveWallet is a no-op until the wallet's connector is registered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: connector changes intentionally retry activation
  useEffect(() => {
    if (!pendingActivation) return;
    if (address?.toLowerCase() === pendingActivation.toLowerCase()) {
      setPendingActivation(undefined);
      return;
    }
    const wallet = wallets.find((candidate) => candidate.address.toLowerCase() === pendingActivation.toLowerCase());
    if (!wallet) return;
    void setActiveWallet(wallet);
  }, [pendingActivation, wallets, connectors, address, setActiveWallet]);

  // Confirm before Privy's asynchronous reconnect can update wagmi.
  const activateUsedWallet = (address: string | undefined) => {
    if (!address) return;
    confirmActive(address);
    setPendingActivation(address);
  };
  const { login } = useLogin({
    onComplete: ({ user, loginAccount }) => {
      if (loginAccount?.type === "wallet") {
        activateUsedWallet(loginAccount.address);
        return;
      }
      // Non-wallet logins use the identity's embedded wallet.
      activateUsedWallet(user.linkedAccounts.find(isEmbeddedWalletAccount)?.address);
    },
    onError: (code) => {
      if (isUserCancelledFlow(code)) return;
      toast.error("Unable to log in", { description: code });
    },
  });
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => activateUsedWallet(wallet.address),
    onError: (code) => {
      if (isUserCancelledFlow(code)) return;
      toast.error("Unable to connect wallet", { description: code });
    },
  });
  const { exit } = useWalletExit();
  const state = getWalletEntryState({ ready, walletsReady, authenticated, isConnected, isExiting });

  if (error) {
    console.error("Privy failed to initialize", error);
    return <p role='alert'>Wallet login is temporarily unavailable. Reload the page and try again.</p>;
  }
  if (state === "connected") return null;
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
