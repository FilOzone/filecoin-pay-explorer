import type { Account, UserToken } from "@filecoin-pay/types";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { AlertsStatus } from "@/components/UserConsole/AlertsStatus";
import { DepositDialog } from "@/components/UserConsole/DepositDialog";
import { WithdrawDialog } from "@/components/UserConsole/WithdrawDialog";
import { useAccountTokens } from "@/hooks/useAccountDetails";
import { getNetworkFromChainId, isNotificationsEligibleNetwork } from "@/utils/network";
import { FundsEmptyState, FundsErrorState, FundsLoadingState, FundsOverviewCards } from "./components";
import FundsSectionLayout from "./components/FundsSectionLayout";

interface FundsSectionProps {
  account: Account;
}

export const FundsSection: React.FC<FundsSectionProps> = ({ account }) => {
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<UserToken | null>(null);

  const { chainId } = useConnection();
  const walletNetwork = getNetworkFromChainId(chainId);
  const isNotificationsEligible = isNotificationsEligibleNetwork(walletNetwork);
  // {isNotificationsEligible && <AlertsStatus subscribed={subscribed} />}

  const { data, isLoading, isError } = useAccountTokens(account.id, 1, { networkOverride: walletNetwork });

  const tokens = useMemo(() => data?.userTokens ?? [], [data?.userTokens]);
  const activeToken = tokens[0] ?? null;

  const handleOpenDeposit = useCallback(() => {
    setSelectedToken(activeToken);
    setDepositDialogOpen(true);
  }, [activeToken]);

  const handleOpenWithdraw = useCallback(() => {
    if (activeToken) {
      setSelectedToken(activeToken);
    }
    setWithdrawDialogOpen(true);
  }, [activeToken]);

  if (isLoading) {
    return <FundsLoadingState onDeposit={handleOpenDeposit} />;
  }

  if (isError) {
    return <FundsErrorState onDeposit={handleOpenDeposit} />;
  }

  if (!data || tokens.length === 0) {
    return <FundsEmptyState onDeposit={handleOpenDeposit} />;
  }

  return (
    <>
      <FundsSectionLayout
        handleOpenDeposit={handleOpenDeposit}
        handleOpenWithdraw={handleOpenWithdraw}
        tokenSymbol={activeToken?.token.symbol}
      >
        {activeToken && <FundsOverviewCards userToken={activeToken} />}
      </FundsSectionLayout>

      <DepositDialog
        userToken={selectedToken}
        userTokens={tokens}
        open={depositDialogOpen}
        onOpenChange={setDepositDialogOpen}
      />

      {selectedToken && (
        <WithdrawDialog userToken={selectedToken} open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen} />
      )}
    </>
  );
};
