import { Button as FilecoinButton } from "@filecoin-foundation/ui-filecoin/Button";
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
import { AlertCircle, CheckCircle2, Loader2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, type Hex, isAddress, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWalletClient } from "wagmi";
import { BASE_DOMAIN } from "@/constants/site-metadata";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import useSynapse from "@/hooks/useSynapse";
import { getPermitSignature } from "@/utils/permit";

interface DepositDialogProps {
  userToken?: UserToken | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TokenDetails {
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
}

type LoadingState = "idle" | "loading" | "success" | "error";

export const DepositDialog: React.FC<DepositDialogProps> = ({ userToken, open, onOpenChange }) => {
  const { address: userAddress } = useAccount();

  // Form state
  const [amount, setAmount] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");

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
      setTokenAddress("");
    }
  }, [open]);

  // Determine which token address to use for queries
  const shouldFetchToken = tokenAddress.trim() && isAddress(tokenAddress.trim());
  const validatedTokenAddress = shouldFetchToken ? (tokenAddress.trim() as Hex) : null;
  const activeTokenAddress = userToken ? (userToken.token.id as Hex) : validatedTokenAddress;

  // Fetch token details using useReadContracts for parallel queries
  const {
    data: tokenDetailsData,
    isLoading: isLoadingTokenDetails,
    isError: isTokenDetailsError,
  } = useReadContracts({
    contracts: activeTokenAddress
      ? [
          {
            address: activeTokenAddress,
            abi: erc20Abi,
            functionName: "symbol",
          },
          {
            address: activeTokenAddress,
            abi: erc20Abi,
            functionName: "decimals",
          },
          {
            address: activeTokenAddress,
            abi: erc20Abi,
            functionName: "name",
          },
        ]
      : [],
    query: {
      enabled: !!activeTokenAddress && open,
    },
  });

  // Parse token details from contract response
  const tokenDetails: TokenDetails | null =
    activeTokenAddress && tokenDetailsData && !isTokenDetailsError
      ? {
          address: activeTokenAddress,
          symbol: (tokenDetailsData[0]?.result as string) || "",
          decimals: Number(tokenDetailsData[1]?.result || 0),
          name: (tokenDetailsData[2]?.result as string) || "",
        }
      : null;

  // Fetch balance using useReadContract
  const { data: balance, isLoading: isLoadingBalance } = useReadContract({
    address: activeTokenAddress || undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!activeTokenAddress && !!userAddress && open,
    },
  });

  // Determine loading state for UI feedback
  const loadingState: LoadingState = !shouldFetchToken
    ? "idle"
    : isLoadingTokenDetails
      ? "loading"
      : isTokenDetailsError || !tokenDetails
        ? "error"
        : "success";

  const handleDeposit = async () => {
    // Determine which token to use
    const token = userToken
      ? {
          symbol: userToken.token.symbol,
          address: userToken.token.id,
          decimals: Number(userToken.token.decimals),
        }
      : tokenDetails;

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
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      console.log("[Deposit] Getting permit signature...");

      // Get permit signature
      const permitSignature = await getPermitSignature(
        {
          tokenAddress: token.address as `0x${string}`,
          ownerAddress: userAddress,
          spenderAddress: constants.contracts.payments.address,
          amount: amountInWei,
          deadline,
          chainId: constants.chain.id,
        },
        walletClient,
        publicClient,
      );

      console.log("[Deposit] Permit signature obtained, submitting transaction...");

      // Execute transaction with rich metadata
      await execute({
        functionName: "depositWithPermit",
        args: [
          token.address,
          userAddress,
          amountInWei,
          permitSignature.deadline,
          permitSignature.v,
          permitSignature.r,
          permitSignature.s,
        ],
        metadata: {
          type: "deposit",
          amount,
          token: token.symbol,
        },
        onSubmitOnChain: () => handleClose(),
      });
    } catch (err) {
      console.error("Deposit failed:", err);
    }
  };

  const handleClose = () => {
    if (!isExecuting) {
      onOpenChange(false);
      // State will be reset by useEffect when open becomes false
    }
  };

  const handleMaxClick = () => {
    if (balance !== undefined && currentToken) {
      const formattedBalance = formatUnits(balance, currentToken.decimals);
      setAmount(formattedBalance);
    }
  };

  // Determine current token to display
  const currentToken = userToken
    ? {
        symbol: userToken.token.symbol,
        decimals: Number(userToken.token.decimals),
        address: userToken.token.id,
      }
    : tokenDetails;

  const canDeposit = currentToken && amount && !isExecuting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>Deposit {currentToken?.symbol || "Tokens"}</DialogTitle>
          <DialogDescription>
            {userToken
              ? `Deposit more ${userToken.token.symbol} tokens to your account.`
              : "Enter a token contract address to deposit tokens."}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4'>
          {/* Custom Token Address Input (only if no userToken) */}
          {!userToken && (
            <div className='grid gap-2'>
              <Label htmlFor='tokenAddress'>Token Contract Address</Label>
              <div className='flex gap-2'>
                <Input
                  id='tokenAddress'
                  placeholder='0x...'
                  value={tokenAddress}
                  onChange={(e) => {
                    setTokenAddress(e.target.value);
                  }}
                  disabled={loadingState === "loading" || isExecuting}
                  className='font-mono text-sm'
                />
              </div>

              {/* Token Validation & Details */}
              {tokenAddress && (
                <div className='mt-2 space-y-2'>
                  {!validatedTokenAddress ? (
                    <div className='flex items-center gap-2 text-sm text-destructive'>
                      <AlertCircle className='h-4 w-4' />
                      <span>Invalid token address</span>
                    </div>
                  ) : isLoadingTokenDetails ? (
                    <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                      <Loader2 className='h-4 w-4 animate-spin' />
                      <span>Loading token details...</span>
                    </div>
                  ) : isTokenDetailsError ? (
                    <div className='flex items-center gap-2 text-sm text-destructive'>
                      <AlertCircle className='h-4 w-4' />
                      <span>Failed to load token details</span>
                    </div>
                  ) : tokenDetails ? (
                    <div className='rounded-lg bg-primary/10 p-3 space-y-2'>
                      <div className='flex items-center gap-2 text-sm text-primary'>
                        <CheckCircle2 className='h-4 w-4' />
                        <span className='font-medium'>Token loaded successfully</span>
                      </div>
                      <div className='grid grid-cols-2 gap-2 text-xs'>
                        <div>
                          <span className='text-muted-foreground'>Symbol:</span>{" "}
                          <span className='font-medium'>{tokenDetails.symbol}</span>
                        </div>
                        <div>
                          <span className='text-muted-foreground'>Decimals:</span>{" "}
                          <span className='font-medium'>{tokenDetails.decimals}</span>
                        </div>
                        <div className='col-span-2'>
                          <span className='text-muted-foreground'>Name:</span>{" "}
                          <span className='font-medium'>{tokenDetails.name}</span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

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

              {!userToken && tokenDetails && (
                <div className='p-3 rounded-lg bg-muted/30 space-y-2'>
                  <div className='flex justify-between text-xs'>
                    <span className='text-muted-foreground'>Contract Address</span>
                    <span className='font-mono'>{`${tokenDetails.address.slice(0, 6)}...${tokenDetails.address.slice(-4)}`}</span>
                  </div>
                  {tokenDetails.name && (
                    <div className='flex justify-between text-xs'>
                      <span className='text-muted-foreground'>Token Name</span>
                      <span className='font-medium'>{tokenDetails.name}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Amount Input - Only show if token is selected */}
          {currentToken && (
            <div className='grid gap-2'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='amount'>Amount</Label>
                {(balance !== undefined || isLoadingBalance) && (
                  <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                    <Wallet className='h-3 w-3' />
                    <span>
                      Balance:{" "}
                      {isLoadingBalance || balance === undefined ? (
                        <Loader2 className='h-3 w-3 animate-spin inline' />
                      ) : (
                        <span className='font-medium text-foreground'>
                          {Number(formatUnits(balance, currentToken.decimals)).toLocaleString(undefined, {
                            maximumFractionDigits: 6,
                          })}{" "}
                          {currentToken.symbol}
                        </span>
                      )}
                    </span>
                  </div>
                )}
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
                  disabled={isExecuting || balance === undefined || isLoadingBalance}
                >
                  MAX
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                Enter the amount of {currentToken.symbol} you want to deposit
              </p>
            </div>
          )}

          {/* Info Message for new users */}
          {!userToken && !currentToken && (
            <div className='p-4 rounded-lg bg-muted/30 border border-dashed'>
              <p className='text-sm text-muted-foreground text-center'>
                Enter a token contract address above to begin your deposit
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <FilecoinButton
            baseDomain={BASE_DOMAIN}
            variant='ghost'
            onClick={handleClose}
            disabled={isExecuting}
            className='py-2'
          >
            Cancel
          </FilecoinButton>
          <FilecoinButton
            baseDomain={BASE_DOMAIN}
            variant='primary'
            onClick={handleDeposit}
            disabled={!canDeposit}
            className='py-2'
          >
            {isExecuting ? (
              <>
                <Loader2 className='h-4 w-4 animate-spin mr-2' />
                Processing...
              </>
            ) : (
              "Deposit"
            )}
          </FilecoinButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
