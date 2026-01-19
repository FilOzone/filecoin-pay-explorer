import type { PaymentsMetric } from "@filecoin-pay/types";
import { GET_PAYMENTS_METRICS } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

interface PayMetricsResponse {
  paymentsMetrics: PaymentsMetric[];
}

const usePayMetrics = () =>
  useGraphQLQuery<PayMetricsResponse, PaymentsMetric | undefined>({
    queryKey: ["payMetrics"],
    query: GET_PAYMENTS_METRICS,
    select: (data) => data.paymentsMetrics[0],
    refetchInterval: 60 * 1000,
  });

export default usePayMetrics;
