"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { useMemo } from "react";
import { useConnection } from "wagmi";
import { OperatorApprovalsSection } from "@/components/UserConsole";
import { AccountNotFound, ErrorState } from "@/components/UserConsole/States";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { getNetworkFromChainId } from "@/utils/network";

const AuthorizationsPage = () => {
  const { address, chainId } = useConnection();
  const walletNetwork = useMemo(() => getNetworkFromChainId(chainId), [chainId]);
  const {
    data: account,
    isLoading,
    isError,
    error,
  } = useAccountDetails(address || "", {
    networkOverride: walletNetwork,
  });

  if (!address) return null;
  if (isLoading) return <LoadingStateCard message='Loading your account details...' />;
  if (isError) return <ErrorState error={error} />;
  if (!account) return <AccountNotFound />;

  return <OperatorApprovalsSection account={account} />;
};

export default AuthorizationsPage;
