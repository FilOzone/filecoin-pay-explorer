"use client";

import { getIdentityToken, usePrivy, useWallets } from "@privy-io/react-auth";
import Link from "next/link";
import type { Address } from "viem";
import { isPrivyEmbeddedWallet } from "@/components/UserConsole/console-wallet";
import { ConsolePrivyProvider } from "@/components/UserConsole/providers/ConsoleProviders";
import ApplePaySandbox from "./ApplePaySandbox";

function WalletCheckout({ address }: { address: Address }) {
  const { ready, authenticated } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  if (!ready || (authenticated && !walletsReady))
    return (
      <p className='mx-auto my-12 px-5' role='status'>
        Checking your signed-in wallet…
      </p>
    );
  if (
    !authenticated ||
    !wallets.some((wallet) => isPrivyEmbeddedWallet(wallet) && wallet.address.toLowerCase() === address.toLowerCase())
  )
    return (
      <section className='mx-auto my-12 grid max-w-lg gap-4 rounded-2xl border bg-card p-6 text-foreground'>
        <h1 className='text-2xl font-semibold'>Test with your Filecoin Pay wallet</h1>
        <p>Sign in to the console with email or Google, then choose Apple Pay under Add funds.</p>
        <Link className='font-semibold underline' href='/console'>
          Open the console
        </Link>
        <Link className='underline' href='/sandbox/apple-pay'>
          Try the sample checkout
        </Link>
      </section>
    );
  return <ApplePaySandbox address={address} configured example={false} identity={getIdentityToken} />;
}

export default function HostedApplePaySandbox({ address }: { address: Address }) {
  return (
    <ConsolePrivyProvider>
      <WalletCheckout address={address} />
    </ConsolePrivyProvider>
  );
}
