import type { Account, UserToken } from "@filecoin-pay/types";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { DepositDialog } from "@/components/UserConsole/DepositDialog";
import { WithdrawDialog } from "@/components/UserConsole/WithdrawDialog";
import { useAccountTokens } from "@/hooks/useAccountDetails";
import { EPOCH_DURATION } from "@/utils/constants";
import { getNetworkFromChainId } from "@/utils/network";
import { FundsEmptyState, FundsErrorState, FundsLoadingState, FundsTable } from "./components";

interface FundsSectionProps {
  account: Account;
}

export const FundsSection: React.FC<FundsSectionProps> = ({ account }) => {
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<UserToken | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => BigInt(Math.floor(Date.now() / 1_000)));

  const { chainId } = useConnection();
  const walletNetwork = getNetworkFromChainId(chainId);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(BigInt(Math.floor(Date.now() / 1_000)));
    }, EPOCH_DURATION * 1_000);

    return () => window.clearInterval(intervalId);
  }, []);

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
        currentTimestamp,
        onDeposit: handleDeposit,
        onWithdraw: handleWithdraw,
      })) || [],
    [currentTimestamp, data?.userTokens, handleDeposit, handleWithdraw],
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
        <h3 className='text-2xl font-medium'>Funds</h3>

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
