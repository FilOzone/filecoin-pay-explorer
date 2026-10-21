import { formatAddress } from "@/utils/formatter";
import { resolveAddressName } from "./known-addresses";

/**
 * Local service copy for the console, kept only for Filecoin Warm Storage.
 *
 * Descriptions and homepages for services generally come from the contract via
 * `useServiceMetadata` (IFilecoinServiceMetadata). Warm Storage stays here
 * because the console also shows its published prices, which that interface
 * does not expose. Prices are hand-maintained and are not read from chain.
 *
 * Service names are not duplicated here — they come from `resolveAddressName`,
 * which is what the rest of the explorer already renders for these addresses.
 */

export type ServicePrice = {
  label: string;
  /** Formatted with its token symbol, e.g. "2.5 USDFC". */
  amount: string;
  /** The unit the amount is charged per, e.g. "per TiB / month". */
  unit: string;
};

export type ServiceProfile = {
  /** The known service name, or the truncated operator address when unknown. */
  name: string;
  /** "onchain" marks a self-reported contract name; undefined for the address fallback. */
  nameSource?: "known" | "onchain";
  description?: string;
  homepageUrl?: string;
  pricing?: ServicePrice[];
};

type ServiceMetadataEntry = Omit<ServiceProfile, "name">;

const WARM_STORAGE_ENTRY: ServiceMetadataEntry = {
  description:
    "Warm storage service for the Filecoin Onchain Cloud. Manages PDP-backed datasets, Filecoin Pay storage rails, lifecycle fees, and optional CDN payment rails.",
  homepageUrl: "https://github.com/filozone/filecoin-services",
  pricing: [
    { label: "Storage", amount: "2.5 USDFC", unit: "per TiB / month" },
    { label: "CDN egress", amount: "7 USDFC", unit: "per TiB" },
    { label: "CDN cache miss", amount: "7 USDFC", unit: "per TiB" },
    { label: "Minimum", amount: "0.12 USDFC", unit: "per month" },
  ],
};

// Filecoin Warm Storage Service — calibration and mainnet deployments.
const serviceMetadata: Record<string, ServiceMetadataEntry> = {
  "0x02925630df557f957f70e112ba06e50965417ca0": WARM_STORAGE_ENTRY,
  "0x8408502033c418e1bbc97ce9ac48e5528f371a9f": WARM_STORAGE_ENTRY,
};

/** The shape `useServiceMetadata` reads from IFilecoinServiceMetadata. */
export type OnchainServiceMetadata = {
  name?: string;
  description?: string;
  homepage?: string;
};

/**
 * Everything the console needs to present one operator as a service, from the
 * contract's own metadata where it publishes any and local copy otherwise.
 *
 * Prices are local only: IFilecoinServiceMetadata does not carry them.
 */
export function getServiceProfile(operatorAddress: string, onchain?: OnchainServiceMetadata): ServiceProfile {
  const key = operatorAddress.toLowerCase();
  const local = serviceMetadata[key];
  const resolved = resolveAddressName(key, onchain?.name);
  const rejected = resolved?.source === "rejected";
  const contract = rejected ? undefined : onchain;

  return {
    name: resolved?.name ?? formatAddress(operatorAddress),
    nameSource: rejected ? undefined : resolved?.source,
    description: contract?.description ?? local?.description,
    homepageUrl: contract?.homepage ?? local?.homepageUrl,
    pricing: local?.pricing,
  };
}
