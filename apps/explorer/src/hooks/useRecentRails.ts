import type { Rail } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { executeQuery } from "@/services/grapql/client";
import { GET_RECENT_RAILS } from "@/services/grapql/queries";

export interface IRecentRails {
  rails: Rail[];
}

const useRecentRails = (first: number = 10) =>
  useQuery({
    queryKey: ["recentRails", first],
    queryFn: async () => {
      const response = await executeQuery<IRecentRails>(GET_RECENT_RAILS, { first });
      return response.rails;
    },
    refetchInterval: 60 * 1000,
  });

export default useRecentRails;
