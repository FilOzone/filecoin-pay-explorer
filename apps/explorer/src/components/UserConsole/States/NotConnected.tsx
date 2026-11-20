import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { WalletIcon } from "@phosphor-icons/react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import Image from "next/image";
import { CustomConnectButton } from "@/components/shared";
import { getWalletEntryState } from "@/components/shared/CustomConnectButton/state";

const NotConnected = () => {
  const { ready, authenticated, error } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const walletEntryState = getWalletEntryState({ ready, walletsReady, authenticated });

  if (!error && walletEntryState === "loading") return <LoadingStateCard message='Loading wallet...' />;

  if (error || walletEntryState === "preparing")
    return (
      <EmptyStateCard
        titleTag='h2'
        icon={WalletIcon}
        title={error ? "Sign-in unavailable" : "Preparing your wallet"}
        description={error ? "" : "You're signed in. We're connecting your wallet to Filecoin Pay."}
      >
        <CustomConnectButton />
      </EmptyStateCard>
    );

  return (
    <div className='@container'>
      <section
        aria-labelledby='console-sign-in-title'
        className='grid grid-cols-[minmax(0,1fr)_3.25rem] gap-x-3 gap-y-4 rounded-3xl border bg-card p-5 text-card-foreground shadow-sm @xs:grid-cols-[minmax(0,1fr)_5rem] @sm:grid-cols-[minmax(0,1fr)_7rem] @sm:p-8 @3xl:grid-cols-[1.1fr_1fr] @3xl:gap-0 @3xl:overflow-hidden @3xl:p-0'
      >
        <header className='col-start-1 row-start-1 self-center @3xl:self-end @3xl:px-10 @3xl:pt-12 @5xl:px-14 @5xl:pt-16'>
          <h1
            id='console-sign-in-title'
            className='text-balance text-3xl font-semibold leading-[1.08] tracking-tight @sm:text-4xl @3xl:text-5xl'
          >
            <span className='block'>Sign in to </span>Filecoin Pay
          </h1>
        </header>
        <div className='col-span-2 row-start-2 @3xl:col-span-1 @3xl:px-10 @3xl:pb-12 @3xl:pt-4 @5xl:px-14 @5xl:pb-16'>
          <p className='mb-6 max-w-sm text-sm leading-relaxed text-muted-foreground @3xl:mb-7 @3xl:text-base'>
            Manage your balances, payment rails, and services from your wallet.
          </p>
          <CustomConnectButton />
        </div>
        <div className='relative col-start-2 row-start-1 aspect-square overflow-hidden self-start rounded-2xl bg-brand-100 @3xl:row-span-2 @3xl:aspect-auto @3xl:self-stretch @3xl:rounded-none'>
          <Image
            src='/console/sign-in-wallet.webp'
            alt=''
            fill
            loading='eager'
            sizes='(min-width: 1024px) 490px, (min-width: 768px) 45vw, 112px'
            className='object-cover'
          />
        </div>
      </section>
    </div>
  );
};

export default NotConnected;
