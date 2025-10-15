import type { UserToken } from "@filecoin-pay/types";
import { Badge } from "@filecoin-pay/ui/components/badge";
import { Button } from "@filecoin-pay/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Input } from "@filecoin-pay/ui/components/input";
import { Label } from "@filecoin-pay/ui/components/label";
import { Loader2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useWalletClient } from "wagmi";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import useSynapse from "@/hooks/useSynapse";
import type { AccountInfo } from "@/types";
import { formatAddress } from "@/utils/formatter";

interface WithdrawDialogProps {
  userToken: UserToken;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WithdrawDialog: React.FC<WithdrawDialogProps> = ({ userToken, open, onOpenChange }) => {
  const { address: userAddress } = useAccount();

  // Form state
  const [amount, setAmount] = useState("");

  const { synapse, constants } = useSynapse();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // Use the contract transaction hook
  const { execute, isExecuting } = useContractTransaction({
    contractAddress: constants.contracts.payments.address,
    abi: constants.contracts.payments.abi,
    explorerUrl: constants.chain.blockExplorers?.default.url,
  });
  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setAmount("");
    }
  }, [open]);

  // Fetch balance using useReadContract
  const {
    data: accountInfo,
    isLoading: isLoadingAccountInfo,
    isRefetching: isRefetchingAccountInfo,
  } = useReadContract({
    address: constants.contracts.payments.address,
    abi: constants.contracts.payments.abi,
    functionName: "getAccountInfoIfSettled",
    args: [userToken.token.id, userAddress],
    query: {
      enabled: !!userToken?.token?.id && !!userAddress && open,
      refetchInterval: 10 * 1_000,
    },
  });

  const handleWithdraw = async () => {
    // Determine which token to use
    const token = {
      symbol: userToken.token.symbol,
      address: userToken.token.id,
      decimals: Number(userToken.token.decimals),
    };

    if (!token) {
      console.log("No token selected");
      return;
    }

    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      console.log("Invalid amount");
      return;
    }

    if (!synapse) {
      console.log("Synapse not initialized");
      return;
    }

    if (!walletClient || !publicClient) {
      console.log("Wallet client or public client not available");
      return;
    }

    if (!userAddress) {
      console.log("User address not available");
      return;
    }

    try {
      const amountInWei = parseUnits(amount, token.decimals);

      // Execute transaction with rich metadata
      await execute({
        functionName: "withdrawTo",
        args: [token.address, userAddress, amountInWei],
        metadata: {
          type: "withdraw",
          amount,
          token: token.symbol,
          to: userAddress,
        },
        onSubmitOnChain: () => handleClose(),
      });
    } catch (err) {
      console.error("Withdraw failed:", err);
    }
  };

  const handleClose = () => {
    if (!isExecuting) {
      onOpenChange(false);
      // State will be reset by useEffect when open becomes false
    }
  };

  const handleMaxClick = () => {
    if (accountInfo !== undefined && currentToken) {
      const formattedBalance = formatUnits((accountInfo as AccountInfo)[2], currentToken.decimals);
      setAmount(formattedBalance);
    }
  };

  // Determine current token to display
  const currentToken = {
    symbol: userToken.token.symbol,
    decimals: Number(userToken.token.decimals),
    address: userToken.token.id,
    name: userToken.token.name,
  };

  const canWithdraw = accountInfo && parseUnits(amount, currentToken.decimals) <= (accountInfo as AccountInfo)[2];
  const canExecute = !isExecuting && canWithdraw && !isLoadingAccountInfo && !isRefetchingAccountInfo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>Withdraw {currentToken?.symbol || "Tokens"}</DialogTitle>
          <DialogDescription>Withdraw {currentToken?.symbol || "Tokens"} from your account.</DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4'>
          {/* Token Info Display */}
          {currentToken && (
            <div className='space-y-3'>
              <div className='flex items-center justify-between p-3 rounded-lg bg-muted/50'>
                <span className='text-sm text-muted-foreground'>Token</span>
                <div className='flex items-center gap-2'>
                  <span className='font-medium'>{currentToken.symbol}</span>
                  <Badge variant='outline' className='text-xs'>
                    {currentToken.decimals} decimals
                  </Badge>
                </div>
              </div>

              <div className='p-3 rounded-lg bg-muted/30 space-y-2'>
                <div className='flex justify-between text-xs'>
                  <span className='text-muted-foreground'>Contract Address</span>
                  <span className='font-mono'>{`${formatAddress(currentToken.address)}`}</span>
                </div>
                <div className='flex justify-between text-xs'>
                  <span className='text-muted-foreground'>Token Name</span>
                  <span className='font-medium'>{currentToken.name}</span>
                </div>
              </div>
            </div>
          )}

          {/* Amount Input - Only show if token is selected */}
          {currentToken && (
            <div className='grid gap-2'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='amount'>Amount</Label>
                {
                  <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                    <Wallet className='h-3 w-3' />
                    <span>
                      Balance:{" "}
                      {(isLoadingAccountInfo && accountInfo === undefined) || isRefetchingAccountInfo ? (
                        <Loader2 className='h-3 w-3 animate-spin inline' />
                      ) : (
                        <span className='font-medium text-foreground'>
                          {Number(formatUnits((accountInfo as AccountInfo)[2], currentToken.decimals)).toLocaleString(
                            undefined,
                            {
                              maximumFractionDigits: 6,
                            },
                          )}{" "}
                          {currentToken.symbol}
                        </span>
                      )}
                    </span>
                  </div>
                }
              </div>
              <div className='relative'>
                <Input
                  id='amount'
                  type='number'
                  placeholder='0.0'
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min='0'
                  step='any'
                  disabled={isExecuting}
                  className='text-lg pr-16'
                />
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs font-semibold'
                  onClick={handleMaxClick}
                  disabled={isExecuting || accountInfo === undefined || isLoadingAccountInfo || isRefetchingAccountInfo}
                >
                  MAX
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                Enter the amount of {currentToken.symbol} you want to withdraw
              </p>
              <p className='text-xs text-red-500'>
                {canWithdraw ? "" : "Insufficient Available funds in contract account"}
              </p>
            </div>
          )}

          {/* Info Message for new users */}
          {!currentToken && (
            <div className='p-4 rounded-lg bg-muted/30 border border-dashed'>
              <p className='text-sm text-muted-foreground text-center'>
                Enter a token contract address above to begin your withdraw
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={handleClose} disabled={isExecuting}>
            Cancel
          </Button>
          <Button onClick={handleWithdraw} disabled={!canExecute}>
            {isExecuting ? (
              <>
                <Loader2 className='h-4 w-4 animate-spin mr-2' />
                Processing...
              </>
            ) : (
              "Withdraw"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
