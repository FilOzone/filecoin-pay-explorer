import type { Token } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";
import { GET_TOKEN_DETAILS } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

interface GetTokenDetailsResponse {
  token: Token;
}

export const useTokenDetails = (tokenAddress: Hex) => {
  const { executeQuery, network } = useGraphQLQuery();

  return useQuery({
    queryKey: ["token", tokenAddress, network],
    queryFn: async () => {
      const response = await executeQuery<GetTokenDetailsResponse>(GET_TOKEN_DETAILS, {
        id: tokenAddress,
      });

      return response.token || null;
    },
    enabled: !!tokenAddress,
  });
};
