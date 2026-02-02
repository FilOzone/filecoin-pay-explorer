import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { Account, UserToken } from "@filecoin-pay/types";
import { useCallback, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { DepositDialog } from "@/components/UserConsole/DepositDialog";
import { WithdrawDialog } from "@/components/UserConsole/WithdrawDialog";
import { BASE_DOMAIN } from "@/constants/site-metadata";
import { useAccountTokens } from "@/hooks/useAccountDetails";
import { getNetworkFromChainId } from "@/utils/network";
import { FundsEmptyState, FundsErrorState, FundsLoadingState, FundsTable } from "./components";

interface FundsSectionProps {
  account: Account;
}

export const FundsSection: React.FC<FundsSectionProps> = ({ account }) => {
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<UserToken | null>(null);

  const { chainId } = useAccount();
  const walletNetwork = getNetworkFromChainId(chainId);

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
          <Button baseDomain={BASE_DOMAIN} className='py-2' variant='primary' onClick={handleOpenDeposit}>
            Deposit
          </Button>
        </div>

        <FundsTable data={tableData} />
      </div>

      {/* Deposit Dialogs */}
      <DepositDialog userToken={selectedToken} open={depositDialogOpen} onOpenChange={setDepositDialogOpen} />

      {selectedToken && (
        <WithdrawDialog userToken={selectedToken} open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen} />
      )}
    </>
  );
};
