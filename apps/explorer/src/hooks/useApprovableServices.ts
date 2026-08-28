import { useMemo } from "react";
import { GET_APPROVED_OPERATOR_CLIENTS } from "@/services/grapql/queries";
import type { Network } from "@/types";
import { useGraphQLQuery } from "./useGraphQLQuery";
import useNetwork from "./useNetwork";
import { useServiceMetadata } from "./useServiceMetadata";

// Only operators with real adoption qualify for the curated "Select Service"
// dropdown: at least this many distinct paying accounts. Calibration is a
// testnet with a handful of real payers, so its bar is much lower.
const MIN_UNIQUE_PAYERS: Record<Network, number> = { mainnet: 11, calibration: 3 };

// Untrusted contract text: a homepage renders only when it looks like a plain
// URL (no whitespace tricks), and even then as copy-only text, never a link.
const HOMEPAGE_PATTERN = /^https?:\/\/\S+$/i;

interface ApprovedOperatorClientsResponse {
  operatorApprovals: Array<{
    client: { id: string };
    operator: { address: string };
  }>;
}

export interface ApprovableService {
  address: string;
  name: string;
  description?: string;
  homepage?: string;
  payerCount: number;
}

/**
 * Services eligible for the Add Service dropdown: operators meeting the
 * per-network {@link MIN_UNIQUE_PAYERS} bar (from subgraph approvals) that
 * also publish an onchain name via IFilecoinServiceMetadata. Anything unnamed
 * or low-adoption stays reachable through the dialog's custom-address entry
 * instead.
 */
export function useApprovableServices(options?: { networkOverride?: Network }) {
  const { network: contextNetwork } = useNetwork();
  const network = options?.networkOverride ?? contextNetwork;
  const { data: approvals, isLoading } = useGraphQLQuery<
    ApprovedOperatorClientsResponse,
    ApprovedOperatorClientsResponse["operatorApprovals"]
  >({
    networkOverride: options?.networkOverride,
    queryKey: ["approvedOperatorClients"],
    // 1000 covers today's network many times over (~150 payers on the largest
    // operator); popular operators would still clear the threshold if it ever
    // truncates.
    query: GET_APPROVED_OPERATOR_CLIENTS,
    select: (data) => data.operatorApprovals,
  });

  const candidates = useMemo(() => {
    const payersByOperator = new Map<string, Set<string>>();
    for (const approval of approvals ?? []) {
      const operator = approval.operator.address.toLowerCase();
      const payers = payersByOperator.get(operator) ?? new Set<string>();
      payers.add(approval.client.id.toLowerCase());
      payersByOperator.set(operator, payers);
    }
    return Array.from(payersByOperator.entries())
      .filter(([, payers]) => payers.size >= MIN_UNIQUE_PAYERS[network])
      .map(([address, payers]) => ({ address, payerCount: payers.size }));
  }, [approvals, network]);

  // The name gate means candidates are invisible until their onchain reads
  // land — without this, the dropdown briefly claims there are no services.
  const { metadata, isLoading: isLoadingMetadata } = useServiceMetadata(
    candidates.map((candidate) => candidate.address),
  );

  const services = useMemo<ApprovableService[]>(
    () =>
      candidates
        .flatMap((candidate) => {
          const meta = metadata.get(candidate.address);
          if (!meta?.name) return [];
          const homepage = meta.homepage && HOMEPAGE_PATTERN.test(meta.homepage) ? meta.homepage : undefined;
          return [{ ...candidate, name: meta.name, description: meta.description, homepage }];
        })
        .sort((a, b) => b.payerCount - a.payerCount),
    [candidates, metadata],
  );

  return { services, isLoading: isLoading || isLoadingMetadata };
}
