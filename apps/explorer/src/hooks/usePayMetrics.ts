import type { PaymentsMetric } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { GET_PAYMENTS_METRICS } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

export interface IPayMetrics {
  paymentsMetrics: PaymentsMetric[];
}

const usePayMetrics = () => {
  const { executeQuery, network } = useGraphQLQuery();

  return useQuery({
    queryKey: ["payMetrics", network],
    queryFn: async () => {
      const response = await executeQuery<IPayMetrics>(GET_PAYMENTS_METRICS);
      return response.paymentsMetrics[0];
    },
    refetchInterval: 60 * 1000,
  });
};

export default usePayMetrics;
