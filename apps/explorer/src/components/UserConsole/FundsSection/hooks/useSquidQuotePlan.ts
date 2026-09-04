import type { SourceToken } from "@filecoin-project/squid-evm-funding";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import type { Address } from "viem";
import { mainnet } from "@/constants/chains";
import { planSquidTopUp } from "../data/squid-quote";
import type { SquidAcquisitionState } from "./useGuidedSquidAcquisition";

const QUOTE_DEBOUNCE_MS = 500;

export function useSquidQuotePlan({
  acquisitionState,
  address,
  destinationAmount,
  integratorId,
  source,
  sourceAmount,
}: {
  acquisitionState: SquidAcquisitionState;
  address?: Address;
  destinationAmount: bigint | null;
  integratorId: string;
  source?: SourceToken;
  sourceAmount: bigint | null;
}) {
  const [debouncedDestinationAmount] = useDebounce(destinationAmount, QUOTE_DEBOUNCE_MS);
  const isQuoteDebouncing = destinationAmount !== debouncedDestinationAmount;
  const query = useQuery({
    enabled:
      integratorId !== "" &&
      acquisitionState === "idle" &&
      !isQuoteDebouncing &&
      !!address &&
      !!source &&
      debouncedDestinationAmount !== null &&
      debouncedDestinationAmount > 0n &&
      sourceAmount !== null &&
      sourceAmount > 0n,
    queryFn: async () => {
      if (!address || !source || debouncedDestinationAmount === null || sourceAmount === null) {
        throw new Error("Select a source token and enter the USDFC amount.");
      }
      return planSquidTopUp({
        destinationAmount: debouncedDestinationAmount,
        destinationToken: mainnet.contracts.usdfc.address,
        integratorId,
        owner: address,
        source,
        sourceAmount,
      });
    },
    queryKey: [
      "squid",
      "top-up-plan",
      address,
      mainnet.contracts.usdfc.address,
      debouncedDestinationAmount?.toString() ?? "",
      source?.chainId ?? 0,
      source?.token ?? "",
      sourceAmount?.toString() ?? "",
    ],
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 30_000,
  });

  return {
    debouncedDestinationAmount,
    isQuoteDebouncing,
    plan: isQuoteDebouncing ? undefined : query.data,
    quoteError: query.error,
    refetchQuote: query.refetch,
    isReviewing: query.isFetching,
  };
}
