import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import type { UserToken } from "@filecoin-pay/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Label } from "@filecoin-pay/ui/components/label";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Plus, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, type Hex, isAddress, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWalletClient } from "wagmi";
import USDFCLogo from "@/assests/USDFCLogo";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import useSynapse from "@/hooks/useSynapse";
import { formatAddress } from "@/utils/formatter";
import { getPermitSignature } from "@/utils/permit";

interface DepositDialogProps {
  userToken?: UserToken | null;
  userTokens?: UserToken[];
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

function TokenIcon({ symbol, className }: { symbol: string; className?: string }) {
  if (symbol === "USDFC") return <USDFCLogo className={className} />;
  return (
    <div className={`rounded-full bg-zinc-100 flex items-center justify-center ${className}`}>
      <span className='text-sm font-semibold text-zinc-600'>{symbol.charAt(0)}</span>
    </div>
  );
}

export const DepositDialog: React.FC<DepositDialogProps> = ({ userToken, userTokens, open, onOpenChange }) => {
  const { address: userAddress } = useAccount();

  const [amount, setAmount] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [selectedUserToken, setSelectedUserToken] = useState<UserToken | null>(userToken ?? null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const hasKnownTokens = !!userTokens && userTokens.length > 0;

  const { synapse, constants } = useSynapse();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const { execute, isExecuting } = useContractTransaction({
    contractAddress: constants.contracts.payments.address,
    abi: constants.contracts.payments.abi,
    explorerUrl: constants.chain.blockExplorers?.default.url,
  });

  useEffect(() => {
    if (open) {
      setSelectedUserToken(userToken ?? null);
      setShowCustomInput(!userToken && !hasKnownTokens);
      setIsPickerOpen(!userToken && hasKnownTokens);
      setAmount("");
      setTokenAddress("");
    }
  }, [open, userToken, hasKnownTokens]);

  const shouldFetchToken = tokenAddress.trim() && isAddress(tokenAddress.trim());
  const validatedTokenAddress = shouldFetchToken ? (tokenAddress.trim() as Hex) : null;
  const activeTokenAddress = selectedUserToken
    ? (selectedUserToken.token.id as Hex)
    : showCustomInput
      ? validatedTokenAddress
      : null;

  const {
    data: tokenDetailsData,
    isLoading: isLoadingTokenDetails,
    isError: isTokenDetailsError,
  } = useReadContracts({
    contracts: activeTokenAddress
      ? [
          { address: activeTokenAddress, abi: erc20Abi, functionName: "symbol" },
          { address: activeTokenAddress, abi: erc20Abi, functionName: "decimals" },
          { address: activeTokenAddress, abi: erc20Abi, functionName: "name" },
        ]
      : [],
    query: { enabled: !!activeTokenAddress && open },
  });

  const tokenDetails: TokenDetails | null =
    activeTokenAddress && tokenDetailsData && !isTokenDetailsError
      ? {
          address: activeTokenAddress,
          symbol: (tokenDetailsData[0]?.result as string) || "",
          decimals: Number(tokenDetailsData[1]?.result || 0),
          name: (tokenDetailsData[2]?.result as string) || "",
        }
      : null;

  const { data: balance, isLoading: isLoadingBalance } = useReadContract({
    address: activeTokenAddress || undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!activeTokenAddress && !!userAddress && open },
  });

  const loadingState: LoadingState = !shouldFetchToken
    ? "idle"
    : isLoadingTokenDetails
      ? "loading"
      : isTokenDetailsError || !tokenDetails
        ? "error"
        : "success";

  const currentToken = selectedUserToken
    ? {
        symbol: selectedUserToken.token.symbol,
        decimals: Number(selectedUserToken.token.decimals),
        address: selectedUserToken.token.id,
      }
    : tokenDetails;

  const canDeposit = currentToken && amount && !isExecuting;

  const handleSelectKnownToken = (token: UserToken) => {
    setSelectedUserToken(token);
    setShowCustomInput(false);
    setIsPickerOpen(false);
    setTokenAddress("");
  };

  const handleSelectCustom = () => {
    setSelectedUserToken(null);
    setShowCustomInput(true);
    setIsPickerOpen(false);
  };

  const handleDeposit = async () => {
    const token = selectedUserToken
      ? {
          symbol: selectedUserToken.token.symbol,
          address: selectedUserToken.token.id,
          decimals: Number(selectedUserToken.token.decimals),
        }
      : tokenDetails;

    if (!token || !amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) return;
    if (!synapse || !walletClient || !publicClient || !userAddress) return;

    try {
      const amountInWei = parseUnits(amount, token.decimals);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

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
        metadata: { type: "deposit", amount, token: token.symbol },
        onSubmitOnChain: () => handleClose(),
      });
    } catch (err) {
      console.error("Deposit failed:", err);
    }
  };

  const handleClose = () => {
    if (!isExecuting) onOpenChange(false);
  };

  const handleMaxClick = () => {
    if (balance !== undefined && currentToken) {
      setAmount(formatUnits(balance, currentToken.decimals));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>Deposit tokens</DialogTitle>
          <DialogDescription>Deposit supported tokens to your account.</DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-4'>
          {/* Token picker */}
          <div className='grid gap-2'>
            <Label>Token</Label>

            {hasKnownTokens ? (
              <div className='flex flex-col gap-1'>
                {/* Selected token trigger */}
                {selectedUserToken && !isPickerOpen && (
                  <button
                    type='button'
                    onClick={() => setIsPickerOpen(true)}
                    className='flex items-center gap-3 rounded-lg border px-4 py-3 text-left hover:bg-zinc-50 transition-colors'
                  >
                    <TokenIcon symbol={selectedUserToken.token.symbol} className='size-9 shrink-0' />
                    <div className='flex-1 min-w-0'>
                      <p className='font-semibold'>{selectedUserToken.token.symbol}</p>
                      <p className='text-xs text-zinc-400'>{formatAddress(selectedUserToken.token.id)}</p>
                    </div>
                    <span className='text-sm text-zinc-400 mr-2'>{selectedUserToken.token.decimals} decimals</span>
                    <ChevronDown className='size-4 text-zinc-400 shrink-0' />
                  </button>
                )}

                {/* Expanded list */}
                {isPickerOpen && (
                  <div className='rounded-lg border bg-zinc-50 overflow-hidden'>
                    {userTokens.map((token) => (
                      <button
                        key={token.token.id}
                        type='button'
                        onClick={() => handleSelectKnownToken(token)}
                        className='flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white transition-colors border-b border-zinc-100 last:border-b-0'
                      >
                        <TokenIcon symbol={token.token.symbol} className='size-9 shrink-0' />
                        <div className='flex-1 min-w-0'>
                          <p className='font-semibold'>{token.token.symbol}</p>
                          <p className='text-xs text-zinc-400'>{formatAddress(token.token.id)}</p>
                        </div>
                        <span className='text-sm text-zinc-400'>{token.token.decimals} decimals</span>
                      </button>
                    ))}

                    {/* Add supported token */}
                    <button
                      type='button'
                      onClick={handleSelectCustom}
                      className='flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white transition-colors'
                    >
                      <div className='size-9 shrink-0 rounded-full border-2 border-dashed border-zinc-300 flex items-center justify-center'>
                        <Plus className='size-4 text-zinc-400' />
                      </div>
                      <div>
                        <p className='font-semibold'>Add supported token</p>
                        <p className='text-xs text-zinc-400'>Use a different token address</p>
                      </div>
                    </button>
                  </div>
                )}

                {/* Custom address input (shown after selecting "Add supported token") */}
                {showCustomInput && (
                  <div className='flex flex-col gap-2'>
                    <div className='flex gap-2'>
                      <Input
                        placeholder='0x...'
                        value={tokenAddress}
                        onChange={setTokenAddress}
                        disabled={loadingState === "loading" || isExecuting}
                        className='font-mono text-sm'
                      />
                      <Button
                        variant='ghost'
                        size='compact'
                        onClick={() => {
                          setShowCustomInput(false);
                          setIsPickerOpen(true);
                          setTokenAddress("");
                        }}
                      >
                        Back
                      </Button>
                    </div>
                    {tokenAddress && (
                      <div className='space-y-1'>
                        {!validatedTokenAddress ? (
                          <p className='flex items-center gap-1.5 text-sm text-destructive'>
                            <AlertCircle className='size-4' /> Invalid address
                          </p>
                        ) : isLoadingTokenDetails ? (
                          <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
                            <Loader2 className='size-4 animate-spin' /> Loading token...
                          </p>
                        ) : isTokenDetailsError ? (
                          <p className='flex items-center gap-1.5 text-sm text-destructive'>
                            <AlertCircle className='size-4' /> Failed to load token
                          </p>
                        ) : tokenDetails ? (
                          <p className='flex items-center gap-1.5 text-sm text-green-600'>
                            <CheckCircle2 className='size-4' /> {tokenDetails.name} ({tokenDetails.symbol}) ·{" "}
                            {tokenDetails.decimals} decimals
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* No known tokens — plain address input (AccountNotFound / first-time flow) */
              <div className='grid gap-2'>
                <div className='flex gap-2'>
                  <Input
                    placeholder='0x...'
                    value={tokenAddress}
                    onChange={setTokenAddress}
                    disabled={loadingState === "loading" || isExecuting}
                    className='font-mono text-sm'
                  />
                </div>
                {tokenAddress && (
                  <div>
                    {!validatedTokenAddress ? (
                      <p className='flex items-center gap-1.5 text-sm text-destructive'>
                        <AlertCircle className='size-4' /> Invalid address
                      </p>
                    ) : isLoadingTokenDetails ? (
                      <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
                        <Loader2 className='size-4 animate-spin' /> Loading token...
                      </p>
                    ) : isTokenDetailsError ? (
                      <p className='flex items-center gap-1.5 text-sm text-destructive'>
                        <AlertCircle className='size-4' /> Failed to load token
                      </p>
                    ) : tokenDetails ? (
                      <div className='rounded-lg bg-primary/10 p-3'>
                        <p className='flex items-center gap-1.5 text-sm text-primary'>
                          <CheckCircle2 className='size-4' /> {tokenDetails.name} ({tokenDetails.symbol})
                        </p>
                        <p className='text-xs text-muted-foreground mt-1'>
                          {tokenDetails.decimals} decimals · {tokenDetails.address.slice(0, 6)}...
                          {tokenDetails.address.slice(-4)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
                {!currentToken && (
                  <div className='rounded-lg bg-muted/30 border border-dashed p-4'>
                    <p className='text-sm text-muted-foreground text-center'>Enter a token contract address to begin</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Token info badge (no-picker mode only) */}
          {!hasKnownTokens && currentToken && (
            <div className='flex items-center justify-between p-3 rounded-lg bg-muted/50'>
              <span className='text-sm text-muted-foreground'>Token</span>
              <div className='flex items-center gap-2'>
                <span className='font-medium'>{currentToken.symbol}</span>
                <Badge variant='secondary'>{`${currentToken.decimals} decimals`}</Badge>
              </div>
            </div>
          )}

          {/* Amount input */}
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
                  onChange={setAmount}
                  min='0'
                  step='any'
                  disabled={isExecuting}
                  className='text-lg pr-16'
                />
                <Button
                  type='button'
                  variant='ghost'
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
        </div>

        <DialogFooter>
          <Button variant='ghost' onClick={handleClose} disabled={isExecuting} size='compact'>
            Cancel
          </Button>
          <Button variant='primary' onClick={handleDeposit} disabled={!canDeposit} size='compact'>
            {isExecuting ? (
              <span className='flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin mr-2' />
                Processing...
              </span>
            ) : (
              "Deposit"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
