import type { Account, UserToken } from "@filecoin-pay/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DepositDialog } from "@/components/UserConsole/DepositDialog";
import { WithdrawDialog } from "@/components/UserConsole/WithdrawDialog";
import { useAccountTokens } from "@/hooks/useAccountDetails";
import useSynapse from "@/hooks/useSynapse";
import type { Network } from "@/types";
import { EPOCH_DURATION } from "@/utils/constants";
import {
  AddFundsDialog,
  type AddFundsMethod,
  FundsEmptyState,
  FundsErrorState,
  FundsLoadingState,
  FundsOverview,
  FundsSectionLayout,
  TokenSelect,
} from "./components";

type FundsSectionProps = {
  account: Account;
  network: Network;
  onGuidedTopUp?: () => void;
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

export const FundsSection = ({ account, network, onGuidedTopUp }: FundsSectionProps) => {
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [depositToken, setDepositToken] = useState<UserToken | null>(null);

  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawToken, setWithdrawToken] = useState<UserToken | null>(null);

  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => BigInt(Math.floor(Date.now() / 1_000)));

  const { constants } = useSynapse();

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(BigInt(Math.floor(Date.now() / 1_000)));
    }, EPOCH_DURATION * 1_000);

    return () => window.clearInterval(intervalId);
  }, []);

  // Fetch up to 100 tokens for this account (single page, no pagination for console view)
  const { data, isLoading, isError } = useAccountTokens(account.id, 1, {
    networkOverride: network,
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

  // Snapshot each transaction token when its dialog opens so query and selector
  // updates cannot change a part-filled form's target. Keep the snapshots after
  // close so WithdrawDialog remains mounted while tracking its receipt and both
  // dialogs retain a consistent lifecycle. The next open replaces the snapshot.
  const openDirectDeposit = useCallback(() => {
    setDepositToken(selectedToken);
    setDepositDialogOpen(true);
  }, [selectedToken]);

  const canFundWithAnotherToken =
    network === "mainnet" &&
    Boolean(onGuidedTopUp) &&
    selectedToken?.token.id.toLowerCase() === constants.contracts.usdfc.toLowerCase();

  const handleOpenDeposit = useCallback(() => {
    if (canFundWithAnotherToken) {
      setAddFundsOpen(true);
      return;
    }
    openDirectDeposit();
  }, [canFundWithAnotherToken, openDirectDeposit]);

  const handleChooseMethod = useCallback(
    (method: AddFundsMethod) => {
      setAddFundsOpen(false);
      if (method === "deposit") {
        openDirectDeposit();
        return;
      }
      onGuidedTopUp?.();
    },
    [onGuidedTopUp, openDirectDeposit],
  );

  const handleOpenWithdraw = useCallback(() => {
    if (!selectedToken) return;

    setWithdrawToken(selectedToken);
    setWithdrawDialogOpen(true);
  }, [selectedToken]);

  const renderSection = () => {
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
      <FundsSectionLayout
        handleOpenDeposit={handleOpenDeposit}
        handleOpenWithdraw={handleOpenWithdraw}
        tokenSelector={<TokenSelect tokens={userTokens} selectedToken={selectedToken} onSelect={setSelectedTokenId} />}
      >
        <FundsOverview userToken={selectedToken} currentTimestamp={currentTimestamp} />
      </FundsSectionLayout>
    );
  };

  return (
    <>
      {renderSection()}

      {selectedToken ? (
        <AddFundsDialog
          onOpenChange={setAddFundsOpen}
          onSelect={handleChooseMethod}
          open={addFundsOpen}
          squidAvailable={canFundWithAnotherToken}
        />
      ) : null}

      {/* A null token opens the picker expanded, the first-deposit path for an empty account. */}
      <DepositDialog
        depositToken={depositToken}
        tokens={userTokens ?? []}
        open={depositDialogOpen}
        onOpenChange={setDepositDialogOpen}
      />

      {/* Mounted only once a token is captured, so WithdrawDialog keeps a non-nullable prop. */}
      {withdrawToken ? (
        <WithdrawDialog userToken={withdrawToken} open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen} />
      ) : null}
    </>
  );
};
