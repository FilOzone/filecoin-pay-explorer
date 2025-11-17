import { Button as FilecoinButton } from "@filecoin-foundation/ui-filecoin/Button";
import type { Operator, Token } from "@filecoin-pay/types";
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
import { AlertCircle, CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { erc20Abi, isAddress, maxUint256, parseUnits } from "viem";
import { useReadContracts } from "wagmi";
import { BASE_DOMAIN } from "@/constants/site-metadata";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import useSynapse from "@/hooks/useSynapse";
import { formatAddress } from "@/utils/formatter";

interface ApproveOperatorDialogProps {
  operators?: Operator[];
  tokens?: Token[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TokenDetails {
  symbol: string;
  decimals: number;
  name: string;
}

export const ApproveOperatorDialog: React.FC<ApproveOperatorDialogProps> = ({
  operators = [],
  tokens = [],
  open,
  onOpenChange,
}) => {
  // Operator state
  const [operatorInput, setOperatorInput] = useState("");
  const [showOperatorDropdown, setShowOperatorDropdown] = useState(false);
  const operatorRef = useRef<HTMLDivElement>(null);

  // Token state
  const [tokenInput, setTokenInput] = useState("");
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const tokenRef = useRef<HTMLDivElement>(null);

  // Allowance state
  const [lockupAllowance, setLockupAllowance] = useState("");
  const [rateAllowance, setRateAllowance] = useState("");
  const [maxLockupPeriod, setMaxLockupPeriod] = useState("");
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { synapse, constants } = useSynapse();

  const { execute, isExecuting } = useContractTransaction({
    contractAddress: constants.contracts.payments.address,
    abi: constants.contracts.payments.abi,
    explorerUrl: constants.chain.blockExplorers?.default.url,
  });

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (operatorRef.current && !operatorRef.current.contains(event.target as Node)) {
        setShowOperatorDropdown(false);
      }
      if (tokenRef.current && !tokenRef.current.contains(event.target as Node)) {
        setShowTokenDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setOperatorInput("");
      setTokenInput("");
      setLockupAllowance("");
      setRateAllowance("");
      setMaxLockupPeriod("");
      setIsUnlimited(false);
      setShowOperatorDropdown(false);
      setShowTokenDropdown(false);
    }
  }, [open]);

  // Determine if input is a valid address or matches a known entity
  const operatorAddress = (() => {
    const trimmed = operatorInput.trim();
    if (isAddress(trimmed)) return trimmed as `0x${string}`;
    const matchedOperator = operators.find(
      (op) => op.address.toLowerCase() === trimmed.toLowerCase() || op.id.toLowerCase() === trimmed.toLowerCase(),
    );
    return matchedOperator ? (matchedOperator.id as `0x${string}`) : null;
  })();

  const tokenAddress = (() => {
    const trimmed = tokenInput.trim();
    if (isAddress(trimmed)) return trimmed as `0x${string}`;
    const matchedToken = tokens.find(
      (t) => t.id.toLowerCase() === trimmed.toLowerCase() || t.symbol.toLowerCase() === trimmed.toLowerCase(),
    );
    return matchedToken ? (matchedToken.id as `0x${string}`) : null;
  })();

  // Filter operators and tokens based on input
  const filteredOperators = operators.filter((op) => {
    const search = operatorInput.toLowerCase();
    return op.address.toLowerCase().includes(search) || op.id.toLowerCase().includes(search);
  });

  const filteredTokens = tokens.filter((t) => {
    const search = tokenInput.toLowerCase();
    return (
      t.symbol.toLowerCase().includes(search) ||
      t.name.toLowerCase().includes(search) ||
      t.id.toLowerCase().includes(search)
    );
  });

  // Fetch token details if custom address is provided
  const shouldFetchToken = tokenAddress && !tokens.find((t) => t.id === tokenAddress);

  const {
    data: tokenDetailsData,
    isLoading: isLoadingTokenDetails,
    isError: isTokenDetailsError,
  } = useReadContracts({
    contracts: shouldFetchToken
      ? [
          {
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "symbol",
          },
          {
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "decimals",
          },
          {
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "name",
          },
        ]
      : [],
    query: {
      enabled: !!shouldFetchToken && open,
    },
  });

  // Get token details from known tokens or fetched data
  const tokenDetails: TokenDetails | null = (() => {
    if (!tokenAddress) return null;

    const knownToken = tokens.find((t) => t.id === tokenAddress);
    if (knownToken) {
      return {
        symbol: knownToken.symbol,
        decimals: Number(knownToken.decimals),
        name: knownToken.name,
      };
    }

    if (tokenDetailsData && !isTokenDetailsError) {
      return {
        symbol: (tokenDetailsData[0]?.result as string) || "",
        decimals: Number(tokenDetailsData[1]?.result || 0),
        name: (tokenDetailsData[2]?.result as string) || "",
      };
    }

    return null;
  })();

  const handleApprove = async () => {
    if (!operatorAddress || !tokenAddress || !maxLockupPeriod || !tokenDetails) {
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

    try {
      await execute({
        functionName: "setOperatorApproval",
        args: [tokenAddress, operatorAddress, true, rateInWei, lockupInWei, BigInt(maxLockupPeriod)],
        metadata: {
          type: "approveOperator",
          operator: operatorAddress,
          token: tokenDetails.symbol,
        },
        onSubmitOnChain: () => onOpenChange(false),
        onError: (err) => console.log("[setOperatorApproval]: Failed ", err),
      });
    } catch (err) {
      console.error("Approve failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOperatorValid = !!operatorAddress;
  const isTokenValid = !!tokenAddress && !!tokenDetails && !isLoadingTokenDetails;
  const canSubmit = isOperatorValid && isTokenValid && maxLockupPeriod && !isSubmitting && !isExecuting;

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
          {/* Operator Input - Unified */}
          <div className='grid gap-3'>
            <Label htmlFor='operator'>Operator Address</Label>
            <div className='relative' ref={operatorRef}>
              <div className='relative'>
                <Input
                  id='operator'
                  placeholder='Enter address or select from list...'
                  value={operatorInput}
                  onChange={(e) => {
                    setOperatorInput(e.target.value);
                    setShowOperatorDropdown(true);
                  }}
                  onFocus={() => setShowOperatorDropdown(true)}
                  disabled={isSubmitting}
                  className='pr-10'
                />
                {operators.length > 0 && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='absolute right-0 top-0 h-full px-3'
                    onClick={() => setShowOperatorDropdown(!showOperatorDropdown)}
                    disabled={isSubmitting}
                  >
                    <ChevronDown className='h-4 w-4 text-muted-foreground' />
                  </Button>
                )}
              </div>

              {/* Operator Dropdown */}
              {showOperatorDropdown && filteredOperators.length > 0 && (
                <div className='absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md'>
                  <div className='max-h-[200px] overflow-auto'>
                    {filteredOperators.map((op) => (
                      <button
                        key={op.id}
                        type='button'
                        className='w-full text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors'
                        onClick={() => {
                          setOperatorInput(op.id);
                          setShowOperatorDropdown(false);
                        }}
                      >
                        <div className='font-medium font-mono text-xs'>{formatAddress(op.address)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

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

          {/* Token Input - Unified with Auto-fetch */}
          <div className='grid gap-3'>
            <Label htmlFor='token'>Token Address</Label>
            <div className='relative' ref={tokenRef}>
              <div className='relative'>
                <Input
                  id='token'
                  placeholder='Enter token address or select from list...'
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                    setShowTokenDropdown(true);
                  }}
                  onFocus={() => setShowTokenDropdown(true)}
                  disabled={isSubmitting}
                  className='pr-10'
                />
                {tokens.length > 0 && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='absolute right-0 top-0 h-full px-3'
                    onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                    disabled={isSubmitting}
                  >
                    <ChevronDown className='h-4 w-4 text-muted-foreground' />
                  </Button>
                )}
              </div>

              {/* Token Dropdown */}
              {showTokenDropdown && filteredTokens.length > 0 && (
                <div className='absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md'>
                  <div className='max-h-[200px] overflow-auto'>
                    {filteredTokens.map((token) => (
                      <button
                        key={token.id}
                        type='button'
                        className='w-full text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors'
                        onClick={() => {
                          setTokenInput(token.id);
                          setShowTokenDropdown(false);
                        }}
                      >
                        <div className='flex items-center justify-between'>
                          <div>
                            <div className='font-medium'>{token.symbol}</div>
                            <div className='text-xs text-muted-foreground'>{token.name}</div>
                          </div>
                          <Badge variant='outline' className='text-xs'>
                            {Number(token.decimals)} decimals
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Token Validation & Details */}
              {tokenInput && (
                <div className='mt-2 space-y-2'>
                  {!tokenAddress ? (
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
          <FilecoinButton
            baseDomain={BASE_DOMAIN}
            variant='ghost'
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting || isExecuting}
            className='py-2'
          >
            Cancel
          </FilecoinButton>
          <FilecoinButton
            baseDomain={BASE_DOMAIN}
            variant='primary'
            onClick={handleApprove}
            disabled={!canSubmit}
            className='py-2'
          >
            {isSubmitting || isExecuting ? (
              <span className='flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin mr-2' />
                Processing...
              </span>
            ) : (
              "Approve Operator"
            )}
          </FilecoinButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
