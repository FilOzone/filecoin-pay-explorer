import type { Account, UserToken } from "@filecoin-pay/types";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { AlertsStatus } from "@/components/UserConsole/AlertsStatus";
import { DepositDialog } from "@/components/UserConsole/DepositDialog";
import { WithdrawDialog } from "@/components/UserConsole/WithdrawDialog";
import { useAccountTokens } from "@/hooks/useAccountDetails";
import { getNetworkFromChainId, isNotificationsEligibleNetwork } from "@/utils/network";
import { FundsEmptyState, FundsErrorState, FundsLoadingState, FundsTable } from "./components";

interface FundsSectionProps {
  account: Account;
  subscribed: boolean;
}

export const FundsSection: React.FC<FundsSectionProps> = ({ account, subscribed }) => {
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<UserToken | null>(null);

  const { chainId } = useConnection();
  const walletNetwork = getNetworkFromChainId(chainId);
  const isNotificationsEligible = isNotificationsEligibleNetwork(walletNetwork);

  // Fetch all tokens for this account (no pagination for console view)
  const { data, isLoading, isError } = useAccountTokens(account.id, 1, { networkOverride: walletNetwork });

  const handleDeposit = useCallback((userToken: UserToken) => {
    setSelectedToken(userToken);
    setDepositDialogOpen(true);
  }, []);

  const handleWithdraw = useCallback((userToken: UserToken) => {
    setSelectedToken(userToken);
    setWithdrawDialogOpen(true);
  }, []);

  const handleOpenDeposit = useCallback(() => {
    setDepositDialogOpen(true);
  }, []);

  // Prepare data with action handlers
  const tableData = useMemo(
    () =>
      data?.userTokens.map((token) => ({
        ...token,
        onDeposit: handleDeposit,
        onWithdraw: handleWithdraw,
      })) || [],
    [data?.userTokens, handleDeposit, handleWithdraw],
  );

  if (isLoading) {
    return <FundsLoadingState onDeposit={handleOpenDeposit} />;
  }

  if (isError) {
    return <FundsErrorState onDeposit={handleOpenDeposit} />;
  }

  if (!data || data.userTokens.length === 0) {
    return <FundsEmptyState onDeposit={handleOpenDeposit} />;
  }

  return (
    <>
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <h3 className='text-2xl font-medium'>Funds</h3>
          {isNotificationsEligible && <AlertsStatus subscribed={subscribed} />}
        </div>

        <FundsTable data={tableData} />

        <button
          type='button'
          onClick={handleOpenDeposit}
          title='Deposit any supported token to your account'
          className='flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-sm text-muted-foreground/60 transition-colors hover:border-muted-foreground/40 hover:text-muted-foreground'
        >
          <Plus className='size-3.5' />
          Add token
        </button>
      </div>

      {/* Deposit Dialogs */}
      <DepositDialog userToken={selectedToken} open={depositDialogOpen} onOpenChange={setDepositDialogOpen} />

      {selectedToken && (
        <WithdrawDialog userToken={selectedToken} open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen} />
      )}
    </>
  );
};
