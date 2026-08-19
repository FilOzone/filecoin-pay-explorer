import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { UserToken } from "@filecoin-pay/types";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { AlertsStatus } from "@/components/UserConsole/AlertsStatus";
import { DepositDialog } from "@/components/UserConsole/DepositDialog";
import { WithdrawDialog } from "@/components/UserConsole/WithdrawDialog";
import { getChain } from "@/constants/chains";
import { useAccountToken, useAccountTokens } from "@/hooks/useAccountDetails";
import useSynapse from "@/hooks/useSynapse";
import { EPOCH_DURATION } from "@/utils/constants";
import { getNetworkFromChainId, isNotificationsEligibleNetwork } from "@/utils/network";
import {
  AddFundsDialog,
  type AddFundsMethod,
  FundsEmptyState,
  FundsErrorState,
  FundsLoadingState,
  FundsTable,
  GuidedTopUpDialog,
} from "./components";
import { withoutTopUpSearchParam } from "./data/guided-top-up";

interface FundsSectionProps {
  accountId: string;
  contentHidden?: boolean;
  subscribed: boolean;
  topUpOnly?: boolean;
}

export const FundsSection: React.FC<FundsSectionProps> = ({
  accountId,
  contentHidden = false,
  subscribed,
  topUpOnly = false,
}) => {
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<UserToken | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => BigInt(Math.floor(Date.now() / 1_000)));

  const { address, chainId } = useConnection();
  const { synapse } = useSynapse();
  const walletNetwork = topUpOnly ? "mainnet" : getNetworkFromChainId(chainId);
  const targetChain = getChain(walletNetwork);
  const usdfcAddress = targetChain.contracts.usdfc.address;
  const isNotificationsEligible = isNotificationsEligibleNetwork(walletNetwork);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [guidedTopUpOpen, setGuidedTopUpOpen] = useState(false);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(BigInt(Math.floor(Date.now() / 1_000)));
    }, EPOCH_DURATION * 1_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const { data, isLoading, isError } = useAccountTokens(accountId, 1, { networkOverride: walletNetwork });
  const { data: usdfcToken } = useAccountToken(accountId, usdfcAddress, { networkOverride: walletNetwork });
  const isUsdfcToken = useCallback(
    (token: UserToken) => token.token.id.toLowerCase() === usdfcAddress.toLowerCase(),
    [usdfcAddress],
  );
  const usdfcDepositOpen = depositDialogOpen && !!selectedToken && isUsdfcToken(selectedToken);
  const { data: accountSummary, isFetching: isAccountSummaryLoading } = useQuery({
    enabled: (guidedTopUpOpen || usdfcDepositOpen) && !!address && synapse?.chain.id === targetChain.id,
    queryFn: synapse ? () => synapse.payments.accountSummary() : undefined,
    queryKey: ["payments", "account-summary", targetChain.id, address],
  });

  const handleWithdraw = useCallback((userToken: UserToken) => {
    setSelectedToken(userToken);
    setWithdrawDialogOpen(true);
  }, []);

  const handleOpenDeposit = useCallback(() => {
    setSelectedToken(null);
    setDepositDialogOpen(true);
  }, []);

  const handleOpenGuidedTopUp = useCallback(() => {
    setGuidedTopUpOpen(true);
  }, []);

  // Squid funding acquires USDFC and lands it on Filecoin, so it only applies to the USDFC row on mainnet.
  const canFundWithAnotherToken = useCallback(
    (token: UserToken) => walletNetwork === "mainnet" && isUsdfcToken(token),
    [isUsdfcToken, walletNetwork],
  );

  const handleAddFunds = useCallback(
    (token: UserToken) => {
      setSelectedToken(token);
      if (isUsdfcToken(token)) {
        setAddFundsOpen(true);
      } else {
        setDepositDialogOpen(true);
      }
    },
    [isUsdfcToken],
  );

  const handleChooseMethod = useCallback(
    (method: AddFundsMethod) => {
      setAddFundsOpen(false);
      if (method === "deposit") {
        setDepositDialogOpen(true);
        return;
      }
      handleOpenGuidedTopUp();
    },
    [handleOpenGuidedTopUp],
  );

  const removeTopUpSearchParam = useCallback(() => {
    if (searchParams.has("topUp")) {
      router.replace(`${pathname}${withoutTopUpSearchParam(searchParams)}`);
    }
  }, [pathname, router, searchParams]);

  const handleGuidedTopUpOpenChange = useCallback(
    (open: boolean) => {
      setGuidedTopUpOpen(open);
      if (!open) removeTopUpSearchParam();
    },
    [removeTopUpSearchParam],
  );

  const handleDepositOpenChange = useCallback(
    (open: boolean) => {
      setDepositDialogOpen(open);
      if (!open) removeTopUpSearchParam();
    },
    [removeTopUpSearchParam],
  );

  useEffect(() => {
    if (searchParams.get("topUp") !== "1") return;

    if (walletNetwork === "mainnet") {
      handleOpenGuidedTopUp();
      return;
    }

    if (!usdfcToken) return;
    setSelectedToken(usdfcToken);
    setDepositDialogOpen(true);
  }, [handleOpenGuidedTopUp, searchParams, usdfcToken, walletNetwork]);

  const tableData = useMemo(
    () =>
      data?.userTokens.map((token) => ({
        ...token,
        currentTimestamp,
        onAddFunds: handleAddFunds,
        onWithdraw: handleWithdraw,
      })) || [],
    [currentTimestamp, data?.userTokens, handleAddFunds, handleWithdraw],
  );

  let fundsContent: ReactNode;
  if (isLoading) {
    fundsContent = <FundsLoadingState onDeposit={handleOpenDeposit} />;
  } else if (isError) {
    fundsContent = <FundsErrorState onDeposit={handleOpenDeposit} />;
  } else if (!data || data.userTokens.length === 0) {
    fundsContent = <FundsEmptyState onDeposit={handleOpenDeposit} />;
  } else {
    fundsContent = (
      <>
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
      </>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      {!contentHidden && selectedToken && (
        <AddFundsDialog
          onOpenChange={setAddFundsOpen}
          onSelect={handleChooseMethod}
          open={addFundsOpen}
          squidAvailable={canFundWithAnotherToken(selectedToken)}
          squidDisabledReason={
            walletNetwork === "mainnet"
              ? undefined
              : "Cross-chain funding is disabled on the Calibration testnet. Switch to Filecoin mainnet to fund with another token."
          }
          tokenSymbol={selectedToken.token.symbol}
        />
      )}
      <GuidedTopUpDialog
        accountId={accountId}
        accountSummary={accountSummary}
        isAccountSummaryLoading={isAccountSummaryLoading}
        onOpenChange={handleGuidedTopUpOpenChange}
        open={guidedTopUpOpen}
      />
      {!contentHidden && !topUpOnly && (
        <>
          <DepositDialog
            accountSummary={accountSummary}
            isAccountSummaryLoading={isAccountSummaryLoading}
            onOpenChange={handleDepositOpenChange}
            open={depositDialogOpen}
            userToken={selectedToken}
          />
          {selectedToken && (
            <WithdrawDialog userToken={selectedToken} open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen} />
          )}
        </>
      )}
      {contentHidden ? null : topUpOnly ? (
        <div className='flex justify-center'>
          <Button onClick={handleOpenGuidedTopUp} variant='primary'>
            Fund with another token
          </Button>
        </div>
      ) : (
        fundsContent
      )}
    </div>
  );
};
