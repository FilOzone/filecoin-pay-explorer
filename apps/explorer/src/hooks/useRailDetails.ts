import type { Rail, RateChangeQueue, Settlement } from "@filecoin-pay/types";
import { GET_RAIL_DETAILS, GET_RAIL_RATE_CHANGES, GET_RAIL_SETTLEMENTS } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

interface RailDetailsResponse {
  rails: Rail[];
}

interface SettlementsResponse {
  settlements: Settlement[];
}

interface RateChangesResponse {
  rateChangeQueues: RateChangeQueue[];
}

const PAGE_SIZE = 10;

export const useRailDetails = (railId: string) =>
  useGraphQLQuery<RailDetailsResponse, Rail | null>({
    queryKey: ["rail", railId],
    query: GET_RAIL_DETAILS,
    variables: { railId },
    select: (data) => data.rails[0] || null,
    enabled: !!railId,
  });

export const useRailSettlements = (railId: string, page: number = 1) =>
  useGraphQLQuery<SettlementsResponse, { settlements: Settlement[]; hasMore: boolean }>({
    queryKey: ["rail", railId, "settlements", page],
    query: GET_RAIL_SETTLEMENTS,
    variables: {
      railId,
      first: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    },
    select: (data) => ({
      settlements: data.settlements,
      hasMore: data.settlements.length === PAGE_SIZE,
    }),
    enabled: !!railId,
  });

export const useRailRateChanges = (railId: string, page: number = 1) =>
  useGraphQLQuery<RateChangesResponse, { rateChanges: RateChangeQueue[]; hasMore: boolean }>({
    queryKey: ["rail", railId, "rateChanges", page],
    query: GET_RAIL_RATE_CHANGES,
    variables: {
      railId,
      first: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    },
    select: (data) => ({
      rateChanges: data.rateChangeQueues,
      hasMore: data.rateChangeQueues.length === PAGE_SIZE,
    }),
    enabled: !!railId,
  });
