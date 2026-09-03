import { useQueries, useQueryClient } from "@tanstack/react-query";
import { type Address, getAddress } from "viem";
import { useConfig } from "wagmi";
import { getPublicClient } from "wagmi/actions";
import { mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import {
  type BalanceReader,
  type PaymentSource,
  rankPaymentSources,
  readPaymentSources,
} from "../../data/payment-sources";
import type { SquidClient } from "../../data/squid-deposit-route";
import { type PaymentToken, paymentTokensQueryOptions } from "../../data/squid-payment-tokens";

type ScanChainId = (typeof SQUID_SOURCE_CHAINS)[number]["id"];

/**
 * The networks a payment can come from: every Squid source except Filecoin
 * itself. Squid lists bridged USDC there too, but paying from Filecoin would
 * need FIL for gas, which this dialog promises not to.
 */
export const PAYMENT_SCAN_CHAINS = SQUID_SOURCE_CHAINS.filter((chain) => chain.id !== mainnet.id);

/** One network's part of the scan: Squid's token list, then the balances through the network's client. */
export function buildPaymentSourceQuery({
  chainId,
  getClient,
  loadTokens,
  owner,
}: {
  chainId: number;
  getClient: (chainId: number) => BalanceReader | undefined;
  loadTokens: (chainId: number) => Promise<PaymentToken[]>;
  owner: Address | undefined;
}) {
  return {
    queryFn: async (): Promise<PaymentSource[]> => {
      if (!owner) throw new Error("No wallet to scan");
      const tokens = await loadTokens(chainId);
      const client = getClient(chainId);
      if (!client) throw new Error(`No RPC client for chain ${chainId}`);
      return readPaymentSources({ chainId, client, owner, tokens });
    },
    queryKey: ["squid-payment-sources", chainId, owner],
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 15_000,
  };
}

/**
 * What the paying wallet holds that Squid can pay with: every scan network is
 * asked at once, and the result comes back best source first.
 */
export function usePaymentSourcesAcrossChains({
  enabled,
  owner,
  squid,
}: {
  enabled: boolean;
  owner: string | undefined;
  squid: SquidClient;
}) {
  const config = useConfig();
  const queryClient = useQueryClient();
  const checksummedOwner = owner ? getAddress(owner) : undefined;
  const isEnabled = enabled && !!checksummedOwner;
  const results = useQueries({
    queries: PAYMENT_SCAN_CHAINS.map((chain) => ({
      ...buildPaymentSourceQuery({
        chainId: chain.id,
        getClient: (chainId) => getPublicClient(config, { chainId: chainId as ScanChainId }),
        loadTokens: (chainId) => queryClient.fetchQuery(paymentTokensQueryOptions(chainId, squid)),
        owner: checksummedOwner,
      }),
      enabled: isEnabled,
    })),
  });
  return {
    /** True while any network has not answered yet. */
    isPending: isEnabled && results.some((result) => result.isPending),
    refetch: () => Promise.all(results.map((result) => result.refetch())),
    sources: rankPaymentSources(results.flatMap((result) => result.data ?? [])),
  };
}
