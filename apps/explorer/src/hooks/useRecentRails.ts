import type { Rail } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { GET_RECENT_RAILS } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

export interface IRecentRails {
  rails: Rail[];
}

const useRecentRails = (first: number = 10) => {
  const { executeQuery, network } = useGraphQLQuery();

  return useQuery({
    queryKey: ["recentRails", first, network],
    queryFn: async () => {
      const response = await executeQuery<IRecentRails>(GET_RECENT_RAILS, {
        first,
      });
      return response.rails;
    },
    refetchInterval: 60 * 1000,
  });
};

export default useRecentRails;
