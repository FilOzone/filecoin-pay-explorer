import type { Account } from "@filecoin-pay/types";
import { useMemo } from "react";
import { useDebounce } from "use-debounce";
import { CHECK_ADDRESS } from "@/services/grapql/queries";
import { formatHexForSearch } from "@/utils/hexUtils";
import { useGraphQLQuery } from "./useGraphQLQuery";

interface CheckAddressResponse {
  accounts: Array<Pick<Account, "id" | "address" | "totalRails" | "totalTokens" | "totalApprovals">>;
  // TODO: Enable when operator page is ready
  // operators: Array<Pick<Operator, "id" | "address" | "totalRails" | "totalTokens" | "totalApprovals">>;
}

export interface LookupResult {
  type: "account" | "operator";
  address: string;
  totalRails: bigint;
  totalTokens: bigint;
  totalApprovals: bigint;
}

export interface UseAddressLookupReturn {
  results: LookupResult[];
  isLoading: boolean;
  error: Error | null;
}

const DEBOUNCE_MS = 500;

export function useAddressLookup(input: string): UseAddressLookupReturn {
  const [debouncedInput] = useDebounce(input, DEBOUNCE_MS);

  const formattedInput = formatHexForSearch(debouncedInput);
  const isEnabled = !!formattedInput;

  const { data, isLoading, error } = useGraphQLQuery<CheckAddressResponse>({
    queryKey: ["check-address", formattedInput],
    query: CHECK_ADDRESS,
    variables: { address: formattedInput },
    enabled: isEnabled,
  });

  const results = useMemo(() => {
    if (!data) return [];

    const accountResults: LookupResult[] = data.accounts.map((account) => ({
      type: "account",
      address: account.address,
      totalRails: account.totalRails,
      totalTokens: account.totalTokens,
      totalApprovals: account.totalApprovals,
    }));

    // TODO: Enable when operator page is ready
    // const operatorResults: LookupResult[] = data.operators.map((operator) => ({
    //   type: "operator",
    //   address: operator.address,
    //   totalRails: operator.totalRails,
    //   totalTokens: operator.totalTokens,
    //   totalApprovals: operator.totalApprovals,
    // }));

    return accountResults;
  }, [data]);

  const isPending = input !== debouncedInput && !!formatHexForSearch(input);

  return {
    results,
    isLoading: isPending || (isEnabled && isLoading),
    error: error ?? null,
  };
}
