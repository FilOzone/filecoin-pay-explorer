"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useConnectWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useEffect } from "react";
import { useAccount } from "wagmi";

/**
 * Console entry point for identity. "Log in" opens Privy's modal (email,
 * Google, or wallet-with-signature). The secondary action connects an external
 * wallet only — no signature, no Privy account — preserving the previous
 * plain-wallet-connect experience.
 *
 * Same contract as the RainbowKit version this replaces: connected renders
 * nothing, everything else renders the buttons, hidden (not absent) while
 * the connector stack initializes so there's no layout shift.
 */
const CustomConnectButton = () => {
  const { ready, authenticated, login, logout } = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { isConnected } = useAccount();

  // Privy sessions survive reloads but the embedded wallet does not always
  // rehydrate into wagmi, stranding the user authenticated-but-disconnected
  // on the login gate after every refresh. When that state appears, reconnect
  // the restored wallet automatically instead of demanding a fresh login.
  const restoredWallet =
    ready && authenticated && !isConnected ? wallets.find((wallet) => wallet.walletClientType === "privy") : undefined;
  useEffect(() => {
    if (restoredWallet) void setActiveWallet(restoredWallet);
  }, [restoredWallet, setActiveWallet]);

  if (isConnected) return null;

  const handleLogin = async () => {
    // Privy sessions and wagmi connections are separate state systems. A
    // restored session with no rehydratable wallet leaves the user
    // authenticated-but-disconnected, and login() refuses to run for an
    // authenticated user — a dead-end where this button silently no-ops.
    // Discard the orphaned session so "Log in" always logs in.
    if (authenticated) await logout();
    login();
  };

  return (
    <div
      {...(!ready && {
        "aria-hidden": true,
        style: {
          opacity: 0,
          pointerEvents: "none",
          userSelect: "none",
        },
      })}
      className='flex flex-col items-center gap-2'
    >
      <Button variant='primary' onClick={handleLogin} type='button' size='compact'>
        Log in
      </Button>
      <button
        type='button'
        onClick={() => connectWallet()}
        className='text-sm underline underline-offset-2 opacity-70 hover:opacity-100'
      >
        Just connect a wallet (no account)
      </button>
    </div>
  );
};

export default CustomConnectButton;
