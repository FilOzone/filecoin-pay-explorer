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
import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, type Hex, isAddress, maxUint256, parseUnits } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import useSynapse from "@/hooks/useSynapse";

interface DepositAndApproveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TokenDetails {
  symbol: string;
  decimals: number;
  name: string;
}

const DepositAndApproveDialog: React.FC<DepositAndApproveDialogProps> = ({ open, onOpenChange }) => {
  const [operatorInput, setOperatorInput] = useState("");
  const operatorRef = useRef<HTMLDivElement>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const tokenRef = useRef<HTMLDivElement>(null);
  const [lockupAllowance, setLockupAllowance] = useState("");
  const [rateAllowance, setRateAllowance] = useState("");
  const [maxLockupPeriod, setMaxLockupPeriod] = useState("");
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { address: userAddress } = useAccount();
  const { synapse } = useSynapse();

  useEffect(() => {
    if (!open) {
      setOperatorInput("");
      setTokenInput("");
      setLockupAllowance("");
      setRateAllowance("");
      setMaxLockupPeriod("");
      setIsUnlimited(false);
    }
  }, [open]);

  const operatorAddress = (() => {
    const trimmed = operatorInput.trim();
    if (isAddress(trimmed)) return trimmed as `0x${string}`;
  })();

  const shouldFetchToken = tokenInput.trim() && isAddress(tokenInput.trim());
  const validatedTokenAddress = shouldFetchToken ? (tokenInput.trim() as Hex) : null;

  const {
    data: tokenDetailsData,
    isLoading: isLoadingTokenDetails,
    isError: isTokenDetailsError,
  } = useReadContracts({
    contracts: validatedTokenAddress
      ? [
          {
            address: validatedTokenAddress,
            abi: erc20Abi,
            functionName: "symbol",
          },
          {
            address: validatedTokenAddress,
            abi: erc20Abi,
            functionName: "decimals",
          },
          {
            address: validatedTokenAddress,
            abi: erc20Abi,
            functionName: "name",
          },
        ]
      : [],
    query: {
      enabled: !!validatedTokenAddress && open,
    },
  });

  const { data: balance, isLoading: isLoadingBalance } = useReadContract({
    address: validatedTokenAddress || undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!validatedTokenAddress && !!userAddress && open,
    },
  });

  const tokenDetails: TokenDetails | null = (() => {
    if (!validatedTokenAddress) return null;

    if (tokenDetailsData && !isTokenDetailsError) {
      return {
        symbol: (tokenDetailsData[0]?.result as string) || "",
        decimals: Number(tokenDetailsData[1]?.result || 0),
        name: (tokenDetailsData[2]?.result as string) || "",
      };
    }

    return null;
  })();

  const handleDepositAndApprove = async () => {
    if (!operatorAddress || !validatedTokenAddress || !tokenAmount || !maxLockupPeriod || !tokenDetails) {
      console.log("Missing required fields");
      return;
    }

    if (!synapse) {
      console.log("Synapse not initialized");
      return;
    }

    setIsSubmitting(true);

    const tokenDecimals = BigInt(tokenDetails.decimals);

    const lockupInWei = isUnlimited
      ? maxUint256
      : lockupAllowance
        ? BigInt(parseUnits(lockupAllowance, Number(tokenDecimals)).toString())
        : 0n;
    const rateInWei = isUnlimited
      ? maxUint256
      : rateAllowance
        ? BigInt(parseUnits(rateAllowance, Number(tokenDecimals)).toString())
        : 0n;
    const tokenAmountInWei = BigInt(parseUnits(tokenAmount, Number(tokenDecimals)).toString());

    try {
      const tx = await synapse?.payments.depositWithPermitAndApproveOperator(
        tokenAmountInWei,
        operatorAddress,
        rateInWei,
        lockupInWei,
        BigInt(maxLockupPeriod),
        validatedTokenAddress,
      );
      await tx?.wait();
      onOpenChange(false);
    } catch (err) {
      console.error("Deposit and Approve failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMaxClick = () => {
    if (balance !== undefined && tokenDetails) {
      const formattedBalance = formatUnits(balance, tokenDetails.decimals);
      setTokenAmount(formattedBalance);
    }
  };

  const isOperatorValid = !!operatorAddress;
  const isTokenValid = !!validatedTokenAddress && !!tokenDetails && !isLoadingTokenDetails;
  const canSubmit = isOperatorValid && isTokenValid && maxLockupPeriod && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[600px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Approve Operator</DialogTitle>
          <DialogDescription>
            Grant an operator permission to manage payments on your behalf with specified limits.
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-6 py-4'>
          {/* Token Input - Unified with Auto-fetch */}
          <div className='grid gap-3'>
            <Label htmlFor='token'>Token Address</Label>
            <div className='relative' ref={tokenRef}>
              <div className='relative'>
                <Input
                  id='token'
                  placeholder='Enter token address 0x...'
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                  }}
                  disabled={isSubmitting}
                  className='pr-10'
                />
              </div>

              {/* Token Validation & Details */}
              {tokenInput && (
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
          </div>

          {/* Token Amount */}
          {tokenDetails && (
            <div className='grid gap-2'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='amount'>Amount</Label>
                {(balance !== undefined || isLoadingBalance) && (
                  <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                    <Wallet className='h-3 w-3' />
                    <span>
                      Balance:{" "}
                      {isLoadingBalance && balance === undefined ? (
                        <Loader2 className='h-3 w-3 animate-spin inline' />
                      ) : (
                        <span className='font-medium text-foreground'>
                          {Number(formatUnits(balance!, tokenDetails.decimals)).toLocaleString(undefined, {
                            maximumFractionDigits: 6,
                          })}{" "}
                          {tokenDetails.symbol}
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
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(e.target.value)}
                  min='0'
                  step='any'
                  disabled={isSubmitting}
                  className='text-lg pr-16'
                />
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs font-semibold'
                  onClick={handleMaxClick}
                  disabled={isSubmitting || balance === undefined || isLoadingBalance}
                >
                  MAX
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                Enter the amount of {tokenDetails.symbol} you want to deposit
              </p>
            </div>
          )}

          {/* Operator Input - Unified */}
          <div className='grid gap-3'>
            <Label htmlFor='operator'>Operator Address</Label>
            <div className='relative' ref={operatorRef}>
              <div className='relative'>
                <Input
                  id='operator'
                  placeholder='Enter Operator address 0x...'
                  value={operatorInput}
                  onChange={(e) => {
                    setOperatorInput(e.target.value);
                  }}
                  disabled={isSubmitting}
                  className='pr-10'
                />
              </div>

              {/* Operator Validation */}
              {operatorInput && (
                <div className='mt-2'>
                  {isOperatorValid ? (
                    <div className='flex items-center gap-2 text-sm text-green-600 dark:text-green-400'>
                      <CheckCircle2 className='h-4 w-4' />
                      <span>Valid operator address</span>
                    </div>
                  ) : (
                    <div className='flex items-center gap-2 text-sm text-destructive'>
                      <AlertCircle className='h-4 w-4' />
                      <span>Invalid address format</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Allowances */}
          <div className='grid gap-3'>
            <div className='flex items-center justify-between'>
              <Label>Allowances</Label>
              <label className='flex items-center gap-2 text-sm cursor-pointer'>
                <input
                  type='checkbox'
                  checked={isUnlimited}
                  onChange={(e) => setIsUnlimited(e.target.checked)}
                  className='rounded'
                />
                Unlimited
              </label>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div>
                <Label htmlFor='lockupAllowance' className='text-xs text-muted-foreground'>
                  Lockup Allowance
                </Label>
                <Input
                  id='lockupAllowance'
                  type='number'
                  placeholder='0.0'
                  value={lockupAllowance}
                  onChange={(e) => setLockupAllowance(e.target.value)}
                  disabled={isUnlimited || isSubmitting}
                />
              </div>
              <div>
                <Label htmlFor='rateAllowance' className='text-xs text-muted-foreground'>
                  Rate Allowance
                </Label>
                <Input
                  id='rateAllowance'
                  type='number'
                  placeholder='0.0'
                  value={rateAllowance}
                  onChange={(e) => setRateAllowance(e.target.value)}
                  disabled={isUnlimited || isSubmitting}
                />
              </div>
            </div>
          </div>

          {/* Max Lockup Period */}
          <div className='grid gap-2'>
            <Label htmlFor='maxLockupPeriod'>Max Lockup Period (epochs)</Label>
            <Input
              id='maxLockupPeriod'
              type='number'
              placeholder='e.g., 2880 (1 day)'
              value={maxLockupPeriod}
              onChange={(e) => setMaxLockupPeriod(e.target.value)}
              disabled={isSubmitting}
            />
            <p className='text-xs text-muted-foreground'>Maximum duration the operator can lock your funds</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleDepositAndApprove} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className='h-4 w-4 animate-spin mr-2' />
                Processing...
              </>
            ) : (
              "Deposit & Approve Operator"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DepositAndApproveDialog;
