import { useQuery } from "@tanstack/react-query";
import useSynapse from "./useSynapse";

interface UseRailSettlementAmountsOptions {
  /** Chain the rail lives on; the query stays idle until synapse is on it. */
  chainId: number;
  railId: bigint;
  untilEpoch: bigint | undefined;
  enabled: boolean;
}

export function useRailSettlementAmounts({ chainId, railId, untilEpoch, enabled }: UseRailSettlementAmountsOptions) {
  const { synapse } = useSynapse();

  return useQuery({
    queryKey: ["railSettlementAmounts", chainId, railId.toString(), untilEpoch?.toString()],
    queryFn: () => {
      if (!synapse) throw new Error("Synapse is not initialized");
      if (untilEpoch === undefined) throw new Error("Settlement epoch is unavailable");

      return synapse.payments.getSettlementAmounts({ railId, untilEpoch });
    },
    enabled: enabled && synapse?.chain.id === chainId && untilEpoch !== undefined,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
