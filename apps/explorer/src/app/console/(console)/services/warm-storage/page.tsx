"use client";

import { useConnection } from "wagmi";
import { WarmStorageSection } from "@/components/UserConsole/WarmStorageSection";
import { WarmStorageTourButton } from "@/components/UserConsole/WarmStorageSection/components";

const WarmStoragePage = () => {
  const { address, chainId } = useConnection();

  function renderContent() {
    // Connection gating lives in the console layout; by here the wallet is connected.
    if (!address || chainId === undefined) return null;
    return <WarmStorageSection />;
  }

  return (
    <div className='flex flex-col gap-15'>
      <div>
        <div className='flex items-baseline justify-between'>
          <h2
            data-tour='page-title'
            className='font-heading text-balance text-3xl/10 font-medium sm:text-5xl/15 sm:tracking-tight'
          >
            Warm Storage
          </h2>
          <WarmStorageTourButton />
        </div>
        <p className='mt-2 text-muted-foreground'>
          Your datasets on this service: what each one costs, whether it is healthy, and which ones you are paying for
          without using.
        </p>
      </div>

      <div>{renderContent()}</div>
    </div>
  );
};

export default WarmStoragePage;
