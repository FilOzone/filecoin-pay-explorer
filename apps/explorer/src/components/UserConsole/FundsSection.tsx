import type { Account, UserToken } from "@filecoin-pay/types";
import { Button } from "@filecoin-pay/ui/components/button";
import { Card } from "@filecoin-pay/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@filecoin-pay/ui/components/empty";
import { Skeleton } from "@filecoin-pay/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@filecoin-pay/ui/components/table";
import { AlertCircle, Minus, Plus, Wallet } from "lucide-react";
import { useState } from "react";
import { useBlockNumber } from "wagmi";
import { useAccountTokens } from "@/hooks/useAccountDetails";
import { formatFutureEpoch, formatToken } from "@/utils/formatter";
import { DepositDialog } from "./DepositDialog";
import { WithdrawDialog } from "./WithdrawDialog";

interface FundsSectionProps {
  account: Account;
}

export const FundsSectionSkeleton = () => (
  <div className='flex flex-col gap-4'>
    <div className='flex items-center justify-between'>
      <h2 className='text-2xl font-semibold'>Funds</h2>
    </div>
    <Card>
      <div className='p-4 space-y-4'>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className='h-16 w-full' />
        ))}
      </div>
    </Card>
  </div>
);

interface TokenRowProps {
  userToken: UserToken;
  onDeposit: (userToken: UserToken) => void;
  onWithdraw: (userToken: UserToken) => void;
  currentEpoch?: bigint;
}

const TokenRow: React.FC<TokenRowProps> = ({ userToken, onDeposit, onWithdraw, currentEpoch }) => {
  const availableFunds = BigInt(userToken.funds) - BigInt(userToken.lockupCurrent);

  const lockupRate = BigInt(userToken.lockupRate);
  const fundedUntil = availableFunds > 0 && lockupRate > 0 ? availableFunds / lockupRate : 0n;
  const fundedUntilEpoch = BigInt(userToken.lockupLastSettledAt) + fundedUntil;

  const fundedUntilTime = !currentEpoch
    ? "..."
    : lockupRate === 0n
      ? "Infinity"
      : fundedUntilEpoch > currentEpoch
        ? formatFutureEpoch(fundedUntilEpoch, currentEpoch)
        : "Expired";

  return (
    <TableRow>
      <TableCell>
        <div className='flex items-center gap-2'>
          <div className='h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center'>
            <Wallet className='h-4 w-4 text-primary' />
          </div>
          <div>
            <div className='font-medium'>{userToken.token.symbol}</div>
            <div className='text-xs text-muted-foreground'>{userToken.token.name}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className='text-right'>
        <div className='font-medium'>
          {formatToken(userToken.funds, userToken.token.decimals, userToken.token.symbol, 8)}
        </div>
        <div className='text-xs text-muted-foreground'>Total Balance</div>
      </TableCell>
      <TableCell className='text-right'>
        <div className='font-medium text-green-600 dark:text-green-400'>
          {formatToken(availableFunds.toString(), userToken.token.decimals, userToken.token.symbol, 8)}
        </div>
        <div className='text-xs text-muted-foreground'>Available</div>
      </TableCell>
      <TableCell className='text-right'>
        <div className='font-medium text-orange-600 dark:text-orange-400'>
          {formatToken(userToken.lockupCurrent, userToken.token.decimals, userToken.token.symbol, 8)}
        </div>
        <div className='text-xs text-muted-foreground'>Locked</div>
      </TableCell>
      <TableCell className='text-right'>
        <div className='font-medium text-blue-600 dark:text-blue-400'>{fundedUntilTime}</div>
        {fundedUntilTime !== "Infinity" && (
          <div className='text-xs text-muted-foreground'>Epoch {fundedUntilEpoch.toLocaleString()}</div>
        )}
      </TableCell>
      <TableCell className='text-right'>
        <Button size='sm' onClick={() => onDeposit(userToken)} className='gap-2'>
          <Plus className='h-4 w-4' />
          Deposit
        </Button>
        <Button size='sm' onClick={() => onWithdraw(userToken)} className='gap-2 ml-2'>
          <Minus className='h-4 w-4' />
          Withdraw
        </Button>
      </TableCell>
    </TableRow>
  );
};

export const FundsSection: React.FC<FundsSectionProps> = ({ account }) => {
  const { data: currentEpoch } = useBlockNumber({ watch: true });
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<UserToken | null>(null);

  // Fetch all tokens for this account (no pagination for console view)
  const { data, isLoading, isError } = useAccountTokens(account.id, 1);

  const handleDeposit = (userToken: UserToken) => {
    setSelectedToken(userToken);
    setDepositDialogOpen(true);
  };

  const handleWithdraw = (userToken: UserToken) => {
    setSelectedToken(userToken);
    setWithdrawDialogOpen(true);
  };

  if (isLoading) {
    return <FundsSectionSkeleton />;
  }

  if (isError) {
    return (
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-semibold'>Funds</h2>
          <Button onClick={() => setDepositDialogOpen(true)}>Deposit</Button>
        </div>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <AlertCircle className='h-12 w-12 text-muted-foreground' />
                <EmptyTitle>Failed to load funds</EmptyTitle>
                <EmptyDescription>Unable to fetch your token balances. Please try again.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </Card>
      </div>
    );
  }

  if (!data || data.userTokens.length === 0) {
    return (
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-semibold'>Funds</h2>
          <Button onClick={() => setDepositDialogOpen(true)}>Deposit</Button>
        </div>
        <Card>
          <div className='py-12'>
            <Empty>
              <EmptyHeader>
                <Wallet className='h-12 w-12 text-muted-foreground' />
                <EmptyTitle>No tokens yet</EmptyTitle>
                <EmptyDescription>
                  You haven't deposited any tokens yet. Deposit tokens to start using Filecoin Pay.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-semibold'>Funds</h2>
          <Button onClick={() => setDepositDialogOpen(true)}>Deposit</Button>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Token</TableHead>
                <TableHead className='text-right'>Total Funds</TableHead>
                <TableHead className='text-right'>Available</TableHead>
                <TableHead className='text-right'>Locked</TableHead>
                <TableHead className='text-right'>Funded Until</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.userTokens.map((userToken) => (
                <TokenRow
                  key={userToken.id}
                  userToken={userToken}
                  onDeposit={handleDeposit}
                  onWithdraw={handleWithdraw}
                  currentEpoch={currentEpoch}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Deposit Dialogs */}
      <DepositDialog userToken={selectedToken} open={depositDialogOpen} onOpenChange={setDepositDialogOpen} />

      {selectedToken && (
        <WithdrawDialog userToken={selectedToken} open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen} />
      )}
    </>
  );
};
