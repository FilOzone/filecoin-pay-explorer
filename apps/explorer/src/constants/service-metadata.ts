import { formatAddress } from "@/utils/formatter";
import { knownAddresses } from "./known-addresses";

/**
 * PLACEHOLDER DATA. Descriptions, homepages, and prices below are mock copy so
 * the console service list and detail page have something to render before the
 * network-aware service metadata registry (#366) lands. None of it is read from
 * chain or verified against the service, and it is not network-scoped: the same
 * operator address is assumed to mean the same service on every network.
 *
 * Service names are not duplicated here — they come from `knownAddresses`, which
 * is what the rest of the explorer already renders for these addresses.
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

const FILECOIN_SERVICES_URL = "https://github.com/filozone/filecoin-services";

const WARM_STORAGE_ENTRY: ServiceMetadataEntry = {
  description:
    "Warm storage service for the Filecoin Onchain Cloud. Manages POP-backed datasets, Filecoin Pay storage rails, lifecycle fees, and optional CDN payment rails.",
  homepageUrl: FILECOIN_SERVICES_URL,
  pricing: [
    { label: "Storage", amount: "2.5 USDFC", unit: "per TiB / month" },
    { label: "CDN egress", amount: "7 USDFC", unit: "per TiB" },
    { label: "CDN cache miss", amount: "7 USDFC", unit: "per TiB" },
    { label: "Minimum", amount: "0.02 USDFC", unit: "per month" },
  ],
};

const serviceMetadata: Record<string, ServiceMetadataEntry> = {
  // Filecoin Warm Storage Service — calibration and mainnet deployments.
  "0x02925630df557f957f70e112ba06e50965417ca0": WARM_STORAGE_ENTRY,
  "0x8408502033c418e1bbc97ce9ac48e5528f371a9f": WARM_STORAGE_ENTRY,
  "0x3c1ae7a70a2b51458fcb7927fd77aae408a1b857": {
    description: "Hot storage and content delivery for application data, billed over Filecoin Pay rails.",
    homepageUrl: FILECOIN_SERVICES_URL,
  },
  "0x3e4e5f067cfda2f16aade21912b8324c3d9624f8": {
    description: "Micropayment service for one-time tips and small recurring transfers.",
    homepageUrl: FILECOIN_SERVICES_URL,
  },
  "0xd19d84c77bbb901971e460830e310933a210dbaa": {
    description: "Pinning service that keeps datasets retrievable and settles storage over Filecoin Pay.",
    homepageUrl: FILECOIN_SERVICES_URL,
  },
  "0x305025d07c1dee47f25a4990179eff2becddca0b": {
    description: "Automated deal-making service that provisions storage deals on the payer's behalf.",
    homepageUrl: FILECOIN_SERVICES_URL,
  },
  "0xa5f90bc2aa73a2e0bad4d7092a932644d5dd5d71": {
    description: "Superseded deal-making deployment. Kept for payers with historical rails.",
    homepageUrl: FILECOIN_SERVICES_URL,
  },
  "0xa53bbc04a0a2b7a7e62a78a24dd6c9280f611b97": {
    description: "Data availability and retrieval service billed per rail.",
    homepageUrl: FILECOIN_SERVICES_URL,
  },
  "0xf88c59cf5ba1e904079079c8ce03148490cb09f8": {
    description: "Document signing service that anchors signature records on Filecoin.",
    homepageUrl: FILECOIN_SERVICES_URL,
  },
  "0x9d4f07b948e87941a4bf4ab335d7a7d854843d75": {
    description: "Reserved-capacity storage service operated by FIL One under a master service agreement.",
    homepageUrl: FILECOIN_SERVICES_URL,
  },
};

/**
 * Everything the console needs to present one operator as a service. Always
 * resolves: an operator with no known name and no metadata still gets a name,
 * the truncated address.
 */
export function getServiceProfile(operatorAddress: string): ServiceProfile {
  const key = operatorAddress.toLowerCase();

  return {
    name: knownAddresses[key] ?? formatAddress(operatorAddress),
    ...serviceMetadata[key],
  };
}
