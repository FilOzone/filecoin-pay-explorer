import { useQuery } from "@tanstack/react-query";
import useSynapse from "./useSynapse";

interface UseRailSettlementAmountsOptions {
  railId: bigint;
  untilEpoch: bigint | undefined;
  enabled: boolean;
}

export function useRailSettlementAmounts({ railId, untilEpoch, enabled }: UseRailSettlementAmountsOptions) {
  const { synapse, constants } = useSynapse();

  return useQuery({
    queryKey: ["railSettlementAmounts", constants.chain.id, railId.toString(), untilEpoch?.toString()],
    queryFn: () => {
      if (!synapse) throw new Error("Synapse is not initialized");
      if (untilEpoch === undefined) throw new Error("Settlement epoch is unavailable");

      return synapse.payments.getSettlementAmounts({ railId, untilEpoch });
    },
    enabled: enabled && synapse !== null && untilEpoch !== undefined,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
