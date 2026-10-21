import { useCallback, useMemo } from "react";
import { getServiceProfile, type ServiceProfile } from "@/constants/service-metadata";
import type { Network } from "@/types";
import { useServiceMetadata } from "./useServiceMetadata";

/**
 * Resolves operator addresses to the profile the console shows for them, from
 * one cached metadata read per address.
 *
 * Owns the three things every caller would otherwise repeat: reading from the
 * chain backing the displayed network rather than the wallet's, keying the
 * metadata by lowercase address, and merging it with local copy.
 */
export function useServiceProfiles(
  operatorAddresses: string[],
  network: Network,
): (operatorAddress: string) => ServiceProfile {
  // Keyed on the addresses themselves so callers need not memoize the array.
  const addressKey = operatorAddresses.join(",").toLowerCase();
  const addresses = useMemo(() => addressKey.split(",").filter(Boolean), [addressKey]);

  const { metadata } = useServiceMetadata(addresses, network);

  return useCallback(
    (operatorAddress: string) => getServiceProfile(operatorAddress, metadata.get(operatorAddress.toLowerCase())),
    [metadata],
  );
}
