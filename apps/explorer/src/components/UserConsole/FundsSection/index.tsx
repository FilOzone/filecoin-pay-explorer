import type { Account, UserToken } from "@filecoin-pay/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { DepositDialog } from "@/components/UserConsole/DepositDialog";
import { WithdrawDialog } from "@/components/UserConsole/WithdrawDialog";
import { useAccountTokens } from "@/hooks/useAccountDetails";
import useSynapse from "@/hooks/useSynapse";
import { EPOCH_DURATION } from "@/utils/constants";
import { getNetworkFromChainId } from "@/utils/network";
import {
  FundsEmptyState,
  FundsErrorState,
  FundsLoadingState,
  FundsOverview,
  FundsSectionLayout,
  TokenSelect,
} from "./components";

type FundsSectionProps = {
  account: Account;
};

/**
 * Temporary bounded fetch, not an exhaustive one. The console shows one token at
 * a time but must be able to select any of them, and the subgraph orders by
 * balance descending, so the default page of ten would drop a zero-balance USDFC
 * off the end and silently default the overview to the wrong token. A wider
 * single page makes that unreachable in practice; an account holding more than
 * this many tokens still truncates. Replace with paging driven by
 * `account.totalTokens` when that becomes realistic.
 */
const TOKEN_SELECTOR_PAGE_SIZE = 100;

/**
 * Picks the token the overview opens on: USDFC matched by contract address, so a
 * look-alike symbol can't win, falling back to the first token on the account.
 */
const findDefaultToken = (userTokens: UserToken[], usdfcAddress: string): UserToken => {
  const usdfc = userTokens.find((userToken) => userToken.token.id.toLowerCase() === usdfcAddress.toLowerCase());
  return usdfc ?? userTokens[0];
};

export const FundsSection = ({ account }: FundsSectionProps) => {
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => BigInt(Math.floor(Date.now() / 1_000)));

  const { chainId } = useConnection();
  const { constants } = useSynapse();
  const walletNetwork = getNetworkFromChainId(chainId);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(BigInt(Math.floor(Date.now() / 1_000)));
    }, EPOCH_DURATION * 1_000);

    return () => window.clearInterval(intervalId);
  }, []);

  // Fetch up to 100 tokens for this account (single page, no pagination for console view)
  const { data, isLoading, isError } = useAccountTokens(account.id, 1, {
    networkOverride: walletNetwork,
    pageSize: TOKEN_SELECTOR_PAGE_SIZE,
  });

  const userTokens = data?.userTokens;

  /**
   * Selection is held as an id and resolved against the current list, so a
   * refetch can't leave a stale token object on screen.
   */
  const selectedToken = useMemo(() => {
    if (!userTokens || userTokens.length === 0) return null;
    const selected = userTokens.find((userToken) => userToken.id === selectedTokenId);
    return selected ?? findDefaultToken(userTokens, constants.contracts.usdfc);
  }, [userTokens, selectedTokenId, constants.contracts.usdfc]);

  const handleOpenDeposit = useCallback(() => {
    setDepositDialogOpen(true);
  }, []);

  const handleOpenWithdraw = useCallback(() => {
    setWithdrawDialogOpen(true);
  }, []);

  if (isLoading) {
    return <FundsLoadingState onDeposit={handleOpenDeposit} />;
  }

  if (isError) {
    return <FundsErrorState onDeposit={handleOpenDeposit} />;
  }

  if (!selectedToken || !userTokens) {
    return <FundsEmptyState onDeposit={handleOpenDeposit} />;
  }

  return (
    <>
      <FundsSectionLayout
        handleOpenDeposit={handleOpenDeposit}
        handleOpenWithdraw={handleOpenWithdraw}
        tokenSelector={<TokenSelect tokens={userTokens} selectedToken={selectedToken} onSelect={setSelectedTokenId} />}
      >
        <FundsOverview userToken={selectedToken} currentTimestamp={currentTimestamp} />
      </FundsSectionLayout>

      <DepositDialog userToken={selectedToken} open={depositDialogOpen} onOpenChange={setDepositDialogOpen} />
      <WithdrawDialog userToken={selectedToken} open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen} />
    </>
  );
};
