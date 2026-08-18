"use client";

import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import type { Account } from "@filecoin-pay/types";
import { useMemo } from "react";
import { useConnection } from "wagmi";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { getNetworkFromChainId, isSupportedChainId } from "@/utils/network";
import { AccountNotFound, ErrorState, NotConnected, UnsupportedChain } from "./States";

export type ConsoleAccountRenderProps = {
  account: Account;
  address: string;
};

type ConsoleAccountGateProps = {
  children: (ctx: ConsoleAccountRenderProps) => React.ReactNode;
};

// Shared connection/account gating for console pages: resolves wallet state and
// account lookup, rendering the matching empty/error state. Children only render
// with a connected wallet on a supported chain and an indexed account.
const ConsoleAccountGate = ({ children }: ConsoleAccountGateProps) => {
  const { address, isConnected, chainId } = useConnection();
  const walletNetwork = useMemo(() => getNetworkFromChainId(chainId), [chainId]);
  const isUnsupportedChain = isConnected && chainId !== undefined && !isSupportedChainId(chainId);

  const {
    data: account,
    isLoading,
    isError,
    error,
  } = useAccountDetails(address || "", { networkOverride: walletNetwork });

  if (!isConnected || !address) return <NotConnected />;
  if (isUnsupportedChain) return <UnsupportedChain />;
  if (isLoading) return <LoadingStateCard message='Loading your account details...' />;
  if (isError) return <ErrorState error={error} />;
  if (!account) return <AccountNotFound />;

  return <>{children({ account, address })}</>;
};

export default ConsoleAccountGate;
