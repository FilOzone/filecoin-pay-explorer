"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useConnectWallet, usePrivy } from "@privy-io/react-auth";
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
  const { isConnected } = useAccount();

  if (isConnected) return null;

  const handleLogin = async () => {
    // Privy sessions and wagmi connections are separate state systems. A
    // restored session whose embedded wallet failed to rehydrate into wagmi
    // leaves the user authenticated-but-disconnected, and login() refuses to
    // run for an authenticated user — a dead-end where this button silently
    // no-ops. Discard the orphaned session so "Log in" always logs in.
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
