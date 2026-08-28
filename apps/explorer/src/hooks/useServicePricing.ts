import { useReadContract } from "wagmi";
import useSynapse from "@/hooks/useSynapse";

export type ServicePricing = {
  /** Base token units (USDFC, 18 decimals) per TiB per month, PDP-only. */
  storagePerTiBPerMonth: bigint;
  /** Base units per TiB of CDN egress; 0n when the service doesn't charge it. */
  cdnEgressPerTiB: bigint;
  cacheMissEgressPerTiB: bigint;
  minimumPerMonth: bigint;
  epochsPerMonth: bigint;
};

type ServicePriceResult = {
  pricePerTiBPerMonthNoCDN: bigint;
  pricePerTiBCdnEgress: bigint;
  pricePerTiBCacheMissEgress: bigint;
  tokenAddress: string;
  epochsPerMonth: bigint;
  minimumPricePerMonth: bigint;
};

/**
 * Live pricing from the service contract's getServicePrice() view — the price
 * list is service identity, so it renders on the service page, never hardcoded.
 */
export const useServicePricing = (): ServicePricing | undefined => {
  const { constants } = useSynapse();
  const fwss = constants.chain.contracts.fwss;

  const { data } = useReadContract({
    address: fwss.address,
    abi: fwss.abi,
    functionName: "getServicePrice",
    query: { staleTime: Number.POSITIVE_INFINITY },
  });

  if (!data) return undefined;
  const pricing = data as ServicePriceResult;
  return {
    storagePerTiBPerMonth: pricing.pricePerTiBPerMonthNoCDN,
    cdnEgressPerTiB: pricing.pricePerTiBCdnEgress,
    cacheMissEgressPerTiB: pricing.pricePerTiBCacheMissEgress,
    minimumPerMonth: pricing.minimumPricePerMonth,
    epochsPerMonth: pricing.epochsPerMonth,
  };
};
