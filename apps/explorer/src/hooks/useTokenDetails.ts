import type { Token } from "@filecoin-pay/types";
import type { Hex } from "viem";
import { GET_TOKEN_DETAILS } from "@/services/grapql/queries";
import { useGraphQLQuery } from "./useGraphQLQuery";

interface TokenDetailsResponse {
  token: Token;
}

export const useTokenDetails = (tokenAddress: Hex) =>
  useGraphQLQuery<TokenDetailsResponse, Token | null>({
    queryKey: ["token", tokenAddress],
    query: GET_TOKEN_DETAILS,
    variables: { id: tokenAddress },
    select: (data) => data.token || null,
    enabled: !!tokenAddress,
  });
