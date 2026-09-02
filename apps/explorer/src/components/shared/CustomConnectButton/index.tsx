"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useConnectWallet, usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

/**
 * Console entry point for identity. "Log in" opens Privy's modal (email,
 * Google, or wallet-with-signature). The secondary action connects an external
 * wallet only — no signature, no Privy account — preserving the previous
 * plain-wallet-connect experience.
 */
const CustomConnectButton = () => {
  const { ready, authenticated, login } = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { isConnected } = useAccount();

  if (!ready || isConnected || authenticated) return null;

  return (
    <div className='flex flex-col items-center gap-2'>
      <Button variant='primary' onClick={login} type='button' size='compact'>
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
