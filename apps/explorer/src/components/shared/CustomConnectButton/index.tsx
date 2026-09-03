"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useConnectWallet, usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

/**
 * Console entry point for identity. "Log in" opens Privy's modal (email,
 * Google, or wallet-with-signature) and creates an embedded wallet for
 * email/social users. The secondary action connects an external wallet only,
 * with no signature and no Privy account, preserving the plain wallet-connect
 * experience.
 */
const CustomConnectButton = () => {
  const { ready, authenticated, login } = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { isConnected } = useAccount();

  if (!ready || isConnected || authenticated) return null;

  return (
    <div className='flex w-full max-w-xs flex-col items-center gap-3'>
      <Button className='w-full' onClick={login} type='button' variant='primary'>
        Log in
      </Button>
      <Button className='w-full' onClick={() => connectWallet()} size='compact' type='button' variant='tertiary'>
        Connect a wallet instead
      </Button>
      <p className='text-center text-xs text-muted-foreground'>
        Email or Google login creates a wallet for you; connecting a wallet uses it as is.
      </p>
    </div>
  );
};

export default CustomConnectButton;
