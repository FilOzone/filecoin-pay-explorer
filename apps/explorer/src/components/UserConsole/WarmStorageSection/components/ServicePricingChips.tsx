"use client";

import { useServicePricing } from "@/hooks/useServicePricing";
import { formatTokenTruncated } from "@/utils/formatter";

/** USDFC decimals; getServicePrice() prices are denominated in the service token. */
const TOKEN_DECIMALS = 18;

const Chip = ({ label, value }: { label: string; value: string }) => (
  <span className='inline-flex items-baseline gap-1 rounded bg-muted px-2 py-0.5 text-xs'>
    <span className='text-muted-foreground'>{label}</span>
    <span className='font-medium tabular-nums'>{value}</span>
  </span>
);

/** Live price list from getServicePrice() — service identity, never hardcoded. */
export const ServicePricingChips = () => {
  const pricing = useServicePricing();
  if (!pricing) return null;

  return (
    <div className='mt-2 flex flex-wrap items-center gap-1.5'>
      <span className='text-sm text-muted-foreground'>Pricing:</span>
      <Chip
        label='storage'
        value={`${formatTokenTruncated(pricing.storagePerTiBPerMonth, TOKEN_DECIMALS, "USDFC")} / TiB / month`}
      />
      {pricing.cdnEgressPerTiB > 0n ? (
        <Chip
          label='CDN egress'
          value={`${formatTokenTruncated(pricing.cdnEgressPerTiB, TOKEN_DECIMALS, "USDFC")} / TiB`}
        />
      ) : null}
      {pricing.cacheMissEgressPerTiB > 0n ? (
        <Chip
          label='cache-miss egress'
          value={`${formatTokenTruncated(pricing.cacheMissEgressPerTiB, TOKEN_DECIMALS, "USDFC")} / TiB`}
        />
      ) : null}
      {pricing.minimumPerMonth > 0n ? (
        <Chip
          label='minimum'
          value={`${formatTokenTruncated(pricing.minimumPerMonth, TOKEN_DECIMALS, "USDFC")} / month`}
        />
      ) : null}
    </div>
  );
};
