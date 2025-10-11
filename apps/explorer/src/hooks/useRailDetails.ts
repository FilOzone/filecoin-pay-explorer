import type { Rail, RateChangeQueue, Settlement } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { executeQuery } from "@/services/grapql/client";
import { GET_RAIL_DETAILS, GET_RAIL_RATE_CHANGES, GET_RAIL_SETTLEMENTS } from "@/services/grapql/queries";

interface GetRailDetailsResponse {
  rails: Rail[];
}

interface GetSettlementsResponse {
  settlements: Settlement[];
}

interface GetRateChangesResponse {
  rateChangeQueues: RateChangeQueue[];
}

const PAGE_SIZE = 10;

export const useRailDetails = (railId: string) => {
  return useQuery({
    queryKey: ["rail", railId],
    queryFn: async () => {
      const response = await executeQuery<GetRailDetailsResponse>(GET_RAIL_DETAILS, {
        railId: railId,
      });
      return response.rails[0] || null;
    },
    enabled: !!railId,
  });
};

export const useRailSettlements = (railId: string, page: number = 1) => {
  return useQuery({
    queryKey: ["rail", railId, "settlements", page],
    queryFn: async () => {
      const response = await executeQuery<GetSettlementsResponse>(GET_RAIL_SETTLEMENTS, {
        railId: railId,
        first: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      });
      return {
        settlements: response.settlements,
        hasMore: response.settlements.length === PAGE_SIZE,
      };
    },
    enabled: !!railId,
  });
};

export const useRailRateChanges = (railId: string, page: number = 1) => {
  return useQuery({
    queryKey: ["rail", railId, "rateChanges", page],
    queryFn: async () => {
      const response = await executeQuery<GetRateChangesResponse>(GET_RAIL_RATE_CHANGES, {
        railId: railId,
        first: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      });
      return {
        rateChanges: response.rateChangeQueues,
        hasMore: response.rateChangeQueues.length === PAGE_SIZE,
      };
    },
    enabled: !!railId,
  });
};
