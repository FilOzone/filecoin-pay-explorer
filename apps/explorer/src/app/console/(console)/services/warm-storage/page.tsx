"use client";

import { useConnection } from "wagmi";
import { CopyButton } from "@/components/shared";
import { WarmStorageSection } from "@/components/UserConsole/WarmStorageSection";
import { WarmStorageTourButton } from "@/components/UserConsole/WarmStorageSection/components";
import { useServiceMetadata } from "@/hooks/useServiceMetadata";

const WarmStoragePage = () => {
  const { address, chainId } = useConnection();
  // Name, description, and homepage come from the service contract's
  // IFilecoinServiceMetadata getters, not hardcoded copy.
  const { name, description, homepage } = useServiceMetadata();

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
            {name ?? "Warm Storage"}
          </h2>
          <WarmStorageTourButton />
        </div>
        {description ? <p className='mt-2 text-muted-foreground'>{description}</p> : null}
        {homepage ? (
          // Contract-supplied homepage is never hyperlinked — copy only.
          <div className='mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground'>
            <span>Homepage:</span>
            <CopyButton value={homepage} displayValue={homepage} showText tooltipText='Copy homepage URL' />
          </div>
        ) : null}
      </div>

      <div>{renderContent()}</div>
    </div>
  );
};

export default WarmStoragePage;
