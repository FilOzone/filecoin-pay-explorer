"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { formatAddress } from "@/utils/formatter";
import WalletProviders from "../WalletProviders";

// Header entry point to the console. Disconnected users see a "Connect Wallet"
// call to action; connected users see their address as a chip. Both navigate to
// /console — the console owns the actual wallet-connection flow, so there is a
// single connect surface across the app.
const AccountButtonInner = () => {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  if (isConnected && address) {
    return (
      <Link
        href='/console'
        aria-label='Open your console'
        className='inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 font-mono text-sm text-zinc-900 transition-colors hover:bg-zinc-100'
      >
        <Wallet className='size-4 text-zinc-500' />
        {formatAddress(address)}
      </Link>
    );
  }

  return (
    <Button variant='primary' size='compact' type='button' onClick={() => router.push("/console")}>
      Connect Wallet
    </Button>
  );
};

const AccountButton = () => (
  <WalletProviders>
    <AccountButtonInner />
  </WalletProviders>
);

export default AccountButton;
