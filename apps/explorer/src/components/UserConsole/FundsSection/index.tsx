import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { Account, UserToken } from "@filecoin-pay/types";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { DepositDialog } from "@/components/UserConsole/DepositDialog";
import { WithdrawDialog } from "@/components/UserConsole/WithdrawDialog";
import { useAccountTokens } from "@/hooks/useAccountDetails";
import { getNetworkFromChainId } from "@/utils/network";
import {
  AddFundsDialog,
  type AddFundsMethod,
  FundsEmptyState,
  FundsErrorState,
  FundsLoadingState,
  FundsTable,
  GuidedTopUpDialog,
} from "./components";
import { calculateFundingRunway, formatSuggestedTopUp } from "./data/funding-runway";
import { withoutTopUpSearchParam } from "./data/guided-top-up";

interface FundsSectionProps {
  account: Account;
  topUpOnly?: boolean;
}

export const FundsSection: React.FC<FundsSectionProps> = ({ account, topUpOnly = false }) => {
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<UserToken | null>(null);
  const [guidedTopUpAmount, setGuidedTopUpAmount] = useState("");

  const { chainId } = useAccount();
  const walletNetwork = getNetworkFromChainId(chainId);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [guidedTopUpOpen, setGuidedTopUpOpen] = useState(false);

  const { data, isLoading, isError } = useAccountTokens(account.id, 1, { networkOverride: walletNetwork });
  const usdfcToken = data?.userTokens.find((token) => token.token.symbol === "USDFC");

  const handleWithdraw = useCallback((userToken: UserToken) => {
    setSelectedToken(userToken);
    setWithdrawDialogOpen(true);
  }, []);

  const handleOpenDeposit = useCallback(() => {
    setDepositDialogOpen(true);
  }, []);

  const handleOpenGuidedTopUp = useCallback((amount: string) => {
    setGuidedTopUpAmount(amount);
    setGuidedTopUpOpen(true);
  }, []);

  const suggestedTopUpFor = useCallback((token: UserToken) => {
    const suggested = calculateFundingRunway(token, BigInt(Math.floor(Date.now() / 1_000))).suggestedTopUp;
    return formatSuggestedTopUp(suggested);
  }, []);

  // Squid funding acquires USDFC and lands it on Filecoin, so it only applies to the USDFC row on mainnet.
  const canFundWithAnotherToken = useCallback(
    (token: UserToken) => walletNetwork === "mainnet" && token.token.symbol === "USDFC",
    [walletNetwork],
  );

  const handleAddFunds = useCallback((token: UserToken) => {
    setSelectedToken(token);
    // USDFC always opens the chooser (Squid is shown, but disabled off mainnet); other tokens deposit directly.
    if (token.token.symbol === "USDFC") {
      setAddFundsOpen(true);
    } else {
      setDepositDialogOpen(true);
    }
  }, []);

  const handleChooseMethod = useCallback(
    (method: AddFundsMethod) => {
      setAddFundsOpen(false);
      if (method === "deposit") {
        setDepositDialogOpen(true);
        return;
      }
      handleOpenGuidedTopUp(selectedToken ? suggestedTopUpFor(selectedToken) : "");
    },
    [handleOpenGuidedTopUp, selectedToken, suggestedTopUpFor],
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
    if (searchParams.get("topUp") !== "1" || !usdfcToken) return;

    const suggestedTopUp = calculateFundingRunway(usdfcToken, BigInt(Math.floor(Date.now() / 1_000))).suggestedTopUp;
    if (suggestedTopUp <= 0n) return;

    if (walletNetwork === "mainnet") {
      handleOpenGuidedTopUp(formatSuggestedTopUp(suggestedTopUp));
      return;
    }

    setSelectedToken(usdfcToken);
    setDepositDialogOpen(true);
  }, [handleOpenGuidedTopUp, searchParams, usdfcToken, walletNetwork]);

  // Prepare data with action handlers
  const tableData = useMemo(
    () =>
      data?.userTokens.map((token) => ({
        ...token,
        onAddFunds: handleAddFunds,
        onWithdraw: handleWithdraw,
      })) || [],
    [data?.userTokens, handleAddFunds, handleWithdraw],
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
          <Button className='py-2' variant='primary' onClick={handleOpenDeposit}>
            Deposit
          </Button>
        </div>
        <FundsTable data={tableData} />

        {/* Deposit Dialogs */}
        <DepositDialog
          userToken={selectedToken}
          open={depositDialogOpen}
          onOpenChange={handleDepositOpenChange}
          suggestedAmount={
            selectedToken?.token.symbol === "USDFC" ? suggestedTopUpFor(selectedToken) || undefined : undefined
          }
        />

        {selectedToken && (
          <WithdrawDialog userToken={selectedToken} open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen} />
        )}
      </>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      {selectedToken && (
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
      {usdfcToken && (
        <GuidedTopUpDialog
          accountId={account.id}
          amount={guidedTopUpAmount}
          onOpenChange={handleGuidedTopUpOpenChange}
          open={guidedTopUpOpen}
          position={usdfcToken}
        />
      )}
      {topUpOnly ? (
        <div className='flex justify-center'>
          <Button
            disabled={!usdfcToken}
            onClick={() => {
              if (usdfcToken) handleOpenGuidedTopUp(suggestedTopUpFor(usdfcToken));
            }}
            variant='primary'
          >
            Fund with another token
          </Button>
        </div>
      ) : (
        fundsContent
      )}
    </div>
  );
};
