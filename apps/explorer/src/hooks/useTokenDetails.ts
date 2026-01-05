import type { Token } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";
import { executeQuery } from "@/services/grapql/client";
import { GET_TOKEN_DETAILS } from "@/services/grapql/queries";

interface GetTokenDetailsResponse {
  token: Token;
}

export const useTokenDetails = (tokenAddress: Hex) =>
  useQuery({
    queryKey: ["token", tokenAddress],
    queryFn: async () => {
      const response = await executeQuery<GetTokenDetailsResponse>(GET_TOKEN_DETAILS, {
        id: tokenAddress,
      });

      return response.token || null;
    },
    enabled: !!tokenAddress,
  });
