import { formatAddress } from "@/utils/formatter";
import { knownAddresses } from "./known-addresses";

/**
 * Local service copy for the console, kept only for Filecoin Warm Storage.
 *
 * Descriptions and homepages for services generally come from the contract via
 * `useServiceMetadata` (IFilecoinServiceMetadata). Warm Storage stays here
 * because the console also shows its published prices, which that interface
 * does not expose. Prices are hand-maintained and are not read from chain.
 *
 * Service names are not duplicated here — they come from `knownAddresses`,
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
    { label: "Minimum", amount: "0.02 USDFC", unit: "per month" },
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
 * Always resolves: an operator with neither still gets a name, the truncated
 * address.
 *
 * A curated `knownAddresses` label outranks the contract's `name()`. Contract
 * text is untrusted and any operator can claim any name, so for the addresses
 * we have vetted the vetted label wins. Unvetted operators still get their
 * onchain name, shown next to their address.
 *
 * Prices are local only: IFilecoinServiceMetadata does not carry them.
 */
export function getServiceProfile(operatorAddress: string, onchain?: OnchainServiceMetadata): ServiceProfile {
  const key = operatorAddress.toLowerCase();
  const local = serviceMetadata[key];

  return {
    name: knownAddresses[key] ?? onchain?.name ?? formatAddress(operatorAddress),
    description: onchain?.description ?? local?.description,
    homepageUrl: onchain?.homepage ?? local?.homepageUrl,
    pricing: local?.pricing,
  };
}
