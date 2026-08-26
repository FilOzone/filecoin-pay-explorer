import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";
import { mainnet } from "@/constants/chains";
import type { SquidAcquisition } from "../data/squid-acquisition";
import {
  checkAutomaticSquidRecovery,
  isAutomaticSquidRecoveryCandidate,
  SquidRecoveryTrustError,
} from "../data/squid-acquisition-recovery";
import { readUsdfcBalance } from "../data/usdfc-balance";

const RECOVERY_POLL_INTERVAL_MS = 10_000;

export function useSquidAcquisitionRecovery(acquisition: SquidAcquisition | null, connectedOwner?: Address) {
  const sourceClient = usePublicClient({ chainId: acquisition?.sourceChainId });
  const destinationClient = usePublicClient({ chainId: mainnet.id });
  const isEligible = isAutomaticSquidRecoveryCandidate(acquisition);
  const ownerMatches =
    connectedOwner !== undefined &&
    acquisition !== null &&
    acquisition.owner.toLowerCase() === connectedOwner.toLowerCase();

  const query = useQuery({
    enabled: isEligible && ownerMatches && !!sourceClient && !!destinationClient,
    queryFn: async () => {
      if (!isAutomaticSquidRecoveryCandidate(acquisition) || !sourceClient || !destinationClient) {
        throw new Error("Automatic Squid recovery is unavailable");
      }
      return checkAutomaticSquidRecovery({
        acquisition,
        getSourceReceipt: (hash) => sourceClient.getTransactionReceipt({ hash }),
        readDestinationBalance: () =>
          readUsdfcBalance(destinationClient, mainnet.contracts.usdfc.address, acquisition.owner),
      });
    },
    queryKey: [
      "squid",
      "acquisition-recovery",
      acquisition?.acquisitionId ?? "legacy",
      acquisition?.owner.toLowerCase() ?? "",
      acquisition?.sourceChainId ?? 0,
      acquisition?.destinationAmount.toString() ?? "",
      acquisition?.destinationBalanceBefore?.toString() ?? "",
      acquisition?.transactionHashes.join(",") ?? "",
    ],
    refetchInterval: (activeQuery) =>
      activeQuery.state.error instanceof SquidRecoveryTrustError ? false : RECOVERY_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    retry: false,
  });

  return { ...query, isEligible, isPermanentError: query.error instanceof SquidRecoveryTrustError };
}
