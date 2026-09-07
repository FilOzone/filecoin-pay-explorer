import { useQuery } from "@tanstack/react-query";
import useSynapse from "@/hooks/useSynapse";

interface UseAccountSummaryOptions {
  /** Wallet address the summary belongs to; the query stays idle while undefined. */
  address: string | undefined;
  /** Chain the summary must come from; the query stays idle until synapse is on it. */
  chainId: number;
  /** Extra caller-side gate (e.g. dialog open) combined with the built-in ones. */
  enabled?: boolean;
}

/**
 * Payments account summary for a wallet, fetched through synapse.
 *
 * `queryFn` is provided unconditionally — react-query warns "No queryFn was
 * passed" when it is undefined while synapse initializes. `enabled` requires
 * Synapse to be ready for both the target chain and connected account.
 */
const useAccountSummary = ({ address, chainId, enabled = true }: UseAccountSummaryOptions) => {
  const { synapse } = useSynapse();
  const synapseAddress = synapse?.client.account.address;
  const hasMatchingAccount = address !== undefined && synapseAddress?.toLowerCase() === address.toLowerCase();

  return useQuery({
    enabled: enabled && hasMatchingAccount && synapse?.chain.id === chainId,
    queryFn: () => {
      if (!synapse) throw new Error("Synapse is not ready");
      return synapse.payments.accountSummary();
    },
    queryKey: ["payments", "account-summary", chainId, address],
  });
};

export default useAccountSummary;
