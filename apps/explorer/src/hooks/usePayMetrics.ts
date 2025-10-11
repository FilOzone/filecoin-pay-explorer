import type { PaymentsMetric } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { executeQuery } from "@/services/grapql/client";
import { GET_PAYMENTS_METRICS } from "@/services/grapql/queries";

export interface IPayMetrics {
  paymentsMetrics: PaymentsMetric[];
}

const usePayMetrics = () =>
  useQuery({
    queryKey: ["payMetrics"],
    queryFn: async () => {
      const response = await executeQuery<IPayMetrics>(GET_PAYMENTS_METRICS);
      return response.paymentsMetrics[0];
    },
    refetchInterval: 60 * 1000,
  });

export default usePayMetrics;
