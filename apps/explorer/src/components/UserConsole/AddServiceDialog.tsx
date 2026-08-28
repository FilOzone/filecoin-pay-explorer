import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Label } from "@filecoin-pay/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@filecoin-pay/ui/components/select";
import { AlertCircle, CheckCircle2, Loader2, Users, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, type Hex, isAddress, maxUint256, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWalletClient } from "wagmi";
import CopyButton from "@/components/shared/CopyButton";
import { paymentTokensByChainId } from "@/constants/payment-tokens";
import { type ApprovableService, useApprovableServices } from "@/hooks/useApprovableServices";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import useSynapse from "@/hooks/useSynapse";
import { formatAddress } from "@/utils/formatter";
import { getNetworkFromChainId } from "@/utils/network";
import { getPermitSignature } from "@/utils/permit";

// A service contract reserves upcoming charges from the deposit for its lockup
// period (30 days for Filecoin Warm Storage Service), so the approval must
// allow at least that long. Submitted with every approval — 30 days in
// Filecoin epochs (2,880/day) — instead of asking users to reason about
// epochs.
const DEFAULT_MAX_LOCKUP_PERIOD = 86_400n;

const CUSTOM_OPTION = "custom";

interface AddServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TokenDetails {
  symbol: string;
  decimals: number;
}

const ServiceDetailsCard: React.FC<{ service: ApprovableService; explorerUrl?: string }> = ({
  service,
  explorerUrl,
}) => (
  <div className='rounded-lg bg-primary/10 p-3 space-y-1.5 text-xs'>
    <div className='flex items-center justify-between'>
      <span className='font-medium text-sm'>{service.name}</span>
      <span className='flex items-center gap-1 text-muted-foreground'>
        <Users className='h-3 w-3' />
        {service.payerCount} users
      </span>
    </div>
    {service.description && <p className='text-muted-foreground'>{service.description}</p>}
    <div className='flex items-center gap-1 text-muted-foreground'>
      <span>Contract:</span>
      {explorerUrl ? (
        <a
          href={`${explorerUrl}/address/${service.address}`}
          target='_blank'
          rel='noreferrer'
          className='font-mono text-primary hover:underline'
        >
          {formatAddress(service.address)}
        </a>
      ) : (
        <span className='font-mono'>{formatAddress(service.address)}</span>
      )}
      <CopyButton value={service.address} tooltipText='Copy contract address' />
    </div>
    {/* Homepage is untrusted contract text: plain text with a copy affordance, never a hyperlink. */}
    {service.homepage && (
      <div className='flex items-center gap-1 text-muted-foreground'>
        <span>Homepage:</span>
        <span className='select-all'>
          {service.homepage.length > 36 ? `${service.homepage.slice(0, 36)}…` : service.homepage}
        </span>
        <CopyButton value={service.homepage} tooltipText='Copy homepage URL' />
      </div>
    )}
  </div>
);

const AddServiceDialog: React.FC<AddServiceDialogProps> = ({ open, onOpenChange }) => {
  // Service selection: a curated service address, or CUSTOM_OPTION + manual input.
  const [serviceChoice, setServiceChoice] = useState("");
  const [customServiceInput, setCustomServiceInput] = useState("");

  // Payment token: a curated token address, or CUSTOM_OPTION + manual input.
  const [tokenChoice, setTokenChoice] = useState("");
  const [customTokenInput, setCustomTokenInput] = useState("");

  const [depositAmount, setDepositAmount] = useState("");

  // Spending limits are an advanced disclosure; the default grant is unlimited.
  const [showLimits, setShowLimits] = useState(false);
  const [isUnlimited, setIsUnlimited] = useState(true);
  const [lockupAllowance, setLockupAllowance] = useState("");
  const [rateAllowance, setRateAllowance] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const { address: userAddress, chainId } = useAccount();
  const { constants } = useSynapse();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const walletNetwork = getNetworkFromChainId(chainId);
  const { services, isLoading: isLoadingServices } = useApprovableServices({ networkOverride: walletNetwork });
  const knownTokens = paymentTokensByChainId[constants.chain.id] ?? [];
  const explorerUrl = constants.chain.blockExplorers?.default.url;

  const { execute, isExecuting } = useContractTransaction({
    contractAddress: constants.contracts.payments.address,
    abi: constants.contracts.payments.abi,
    explorerUrl,
  });

  useEffect(() => {
    if (!open) {
      setServiceChoice("");
      setCustomServiceInput("");
      setTokenChoice("");
      setCustomTokenInput("");
      setDepositAmount("");
      setShowLimits(false);
      setIsUnlimited(true);
      setLockupAllowance("");
      setRateAllowance("");
    }
  }, [open]);

  const selectedService =
    serviceChoice !== CUSTOM_OPTION ? services.find((s) => s.address === serviceChoice) : undefined;
  const operatorAddress: `0x${string}` | undefined = (() => {
    if (selectedService) return selectedService.address as `0x${string}`;
    const trimmed = customServiceInput.trim();
    if (serviceChoice === CUSTOM_OPTION && isAddress(trimmed)) return trimmed;
  })();

  const knownToken = knownTokens.find((token) => token.address === tokenChoice);
  const customTokenAddress =
    tokenChoice === CUSTOM_OPTION && isAddress(customTokenInput.trim()) ? (customTokenInput.trim() as Hex) : null;
  const tokenAddress: `0x${string}` | undefined = knownToken?.address ?? customTokenAddress ?? undefined;

  const {
    data: customTokenData,
    isLoading: isLoadingTokenDetails,
    isError: isTokenDetailsError,
  } = useReadContracts({
    contracts: customTokenAddress
      ? [
          { address: customTokenAddress, abi: erc20Abi, functionName: "symbol" },
          { address: customTokenAddress, abi: erc20Abi, functionName: "decimals" },
        ]
      : [],
    query: { enabled: !!customTokenAddress && open },
  });

  const tokenDetails: TokenDetails | null = (() => {
    if (knownToken) return { symbol: knownToken.symbol, decimals: knownToken.decimals };
    if (customTokenAddress && customTokenData && !isTokenDetailsError) {
      return {
        symbol: (customTokenData[0]?.result as string) || "",
        decimals: Number(customTokenData[1]?.result || 0),
      };
    }
    return null;
  })();

  const { data: balance, isLoading: isLoadingBalance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!tokenAddress && !!userAddress && open },
  });

  const parsedDeposit = (() => {
    if (!depositAmount.trim() || !tokenDetails) return null;
    try {
      return parseUnits(depositAmount.trim(), tokenDetails.decimals);
    } catch {
      return null;
    }
  })();
  const isDepositing = parsedDeposit !== null && parsedDeposit > 0n;

  const handleSubmit = async () => {
    if (!operatorAddress || !tokenAddress || !tokenDetails) return;

    const lockupInWei = isUnlimited
      ? maxUint256
      : lockupAllowance
        ? parseUnits(lockupAllowance, tokenDetails.decimals)
        : 0n;
    const rateInWei = isUnlimited ? maxUint256 : rateAllowance ? parseUnits(rateAllowance, tokenDetails.decimals) : 0n;

    setIsSubmitting(true);
    try {
      if (isDepositing) {
        if (!walletClient || !publicClient || !userAddress) return;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
        const permitSignature = await getPermitSignature(
          {
            tokenAddress,
            ownerAddress: userAddress,
            spenderAddress: constants.contracts.payments.address,
            amount: parsedDeposit,
            deadline,
            chainId: constants.chain.id,
          },
          walletClient,
          publicClient,
        );

        await execute({
          functionName: "depositWithPermitAndApproveOperator",
          args: [
            tokenAddress,
            userAddress,
            parsedDeposit,
            permitSignature.deadline,
            permitSignature.v,
            permitSignature.r,
            permitSignature.s,
            operatorAddress,
            rateInWei,
            lockupInWei,
            DEFAULT_MAX_LOCKUP_PERIOD,
          ],
          metadata: {
            type: "depositAndApprove",
            amount: depositAmount,
            token: tokenDetails.symbol,
            operator: operatorAddress,
          },
          onSubmitOnChain: () => onOpenChange(false),
        });
      } else {
        await execute({
          functionName: "setOperatorApproval",
          args: [tokenAddress, operatorAddress, true, rateInWei, lockupInWei, DEFAULT_MAX_LOCKUP_PERIOD],
          metadata: {
            type: "approveOperator",
            operator: operatorAddress,
            token: tokenDetails.symbol,
          },
          onSubmitOnChain: () => onOpenChange(false),
        });
      }
    } catch (err) {
      console.error("Add service failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMaxClick = () => {
    if (balance !== undefined && tokenDetails) {
      setDepositAmount(formatUnits(balance, tokenDetails.decimals));
    }
  };

  const isOperatorValid = !!operatorAddress;
  const isTokenValid = !!tokenAddress && !!tokenDetails && !isLoadingTokenDetails;
  const isDepositValid = !depositAmount.trim() || isDepositing;
  const canSubmit = isOperatorValid && isTokenValid && isDepositValid && !isSubmitting && !isExecuting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[600px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Add a Service</DialogTitle>
          <DialogDescription>
            Choose a service to pay through your Filecoin Pay account. You can set spending limits and remove it at any
            time.
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-6 py-4'>
          {/* Service */}
          <div className='grid gap-3'>
            <Label htmlFor='service'>Select Service</Label>
            <Select value={serviceChoice} onValueChange={setServiceChoice} disabled={isSubmitting}>
              <SelectTrigger id='service' className='w-full'>
                <SelectValue placeholder={isLoadingServices ? "Loading services…" : "Choose a service…"} />
              </SelectTrigger>
              <SelectContent>
                {services.map((service) => (
                  <SelectItem key={service.address} value={service.address}>
                    <span className='flex items-center gap-2'>
                      <span>{service.name}</span>
                      <span className='font-mono text-xs text-muted-foreground'>
                        ({formatAddress(service.address)})
                      </span>
                    </span>
                  </SelectItem>
                ))}
                {services.length > 0 && <SelectSeparator />}
                <SelectItem value={CUSTOM_OPTION}>Custom service address…</SelectItem>
              </SelectContent>
            </Select>

            {selectedService && <ServiceDetailsCard service={selectedService} explorerUrl={explorerUrl} />}

            {serviceChoice === CUSTOM_OPTION && (
              <div className='grid gap-2'>
                <Input
                  id='customService'
                  placeholder='Service contract address 0x…'
                  value={customServiceInput}
                  onChange={setCustomServiceInput}
                  disabled={isSubmitting}
                />
                {customServiceInput &&
                  (isOperatorValid ? (
                    <div className='flex items-center gap-2 text-sm text-green-600 dark:text-green-400'>
                      <CheckCircle2 className='h-4 w-4' />
                      <span>Valid service address</span>
                    </div>
                  ) : (
                    <div className='flex items-center gap-2 text-sm text-destructive'>
                      <AlertCircle className='h-4 w-4' />
                      <span>Invalid address format</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Payment token */}
          <div className='grid gap-3'>
            <Label htmlFor='paymentToken'>Payment in</Label>
            <Select value={tokenChoice} onValueChange={setTokenChoice} disabled={isSubmitting}>
              <SelectTrigger id='paymentToken' className='w-full'>
                <SelectValue placeholder='Choose a token…' />
              </SelectTrigger>
              <SelectContent>
                {knownTokens.map((token) => (
                  <SelectItem key={token.address} value={token.address}>
                    {token.symbol}
                  </SelectItem>
                ))}
                {knownTokens.length > 0 && <SelectSeparator />}
                <SelectItem value={CUSTOM_OPTION}>Custom token address…</SelectItem>
              </SelectContent>
            </Select>

            {tokenChoice === CUSTOM_OPTION && (
              <div className='grid gap-2'>
                <Input
                  id='customToken'
                  placeholder='Token contract address 0x…'
                  value={customTokenInput}
                  onChange={setCustomTokenInput}
                  disabled={isSubmitting}
                />
                {customTokenInput &&
                  (!customTokenAddress ? (
                    <div className='flex items-center gap-2 text-sm text-destructive'>
                      <AlertCircle className='h-4 w-4' />
                      <span>Invalid token address</span>
                    </div>
                  ) : isLoadingTokenDetails ? (
                    <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                      <Loader2 className='h-4 w-4 animate-spin' />
                      <span>Loading token details…</span>
                    </div>
                  ) : isTokenDetailsError ? (
                    <div className='flex items-center gap-2 text-sm text-destructive'>
                      <AlertCircle className='h-4 w-4' />
                      <span>Failed to load token details</span>
                    </div>
                  ) : tokenDetails ? (
                    <div className='flex items-center gap-2 text-sm text-green-600 dark:text-green-400'>
                      <CheckCircle2 className='h-4 w-4' />
                      <span>
                        {tokenDetails.symbol} · {tokenDetails.decimals} decimals
                      </span>
                    </div>
                  ) : null)}
              </div>
            )}
          </div>

          {/* Deposit amount */}
          {tokenDetails && (
            <div className='grid gap-2'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='amount'>Deposit amount</Label>
                {(balance !== undefined || isLoadingBalance) && (
                  <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                    <Wallet className='h-3 w-3' />
                    <span>
                      Balance:{" "}
                      {isLoadingBalance || balance === undefined ? (
                        <Loader2 className='h-3 w-3 animate-spin inline' />
                      ) : (
                        <span className='font-medium text-foreground'>
                          {Number(formatUnits(balance, tokenDetails.decimals)).toLocaleString(undefined, {
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
                  value={depositAmount}
                  onChange={setDepositAmount}
                  min='0'
                  step='any'
                  disabled={isSubmitting}
                  className='text-lg pr-16'
                />
                <Button
                  type='button'
                  variant='ghost'
                  className='absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs font-semibold'
                  onClick={handleMaxClick}
                  disabled={isSubmitting || balance === undefined || isLoadingBalance}
                >
                  MAX
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                Funds stay in your account and the service bills them as you use it. Leave empty to add the service
                without depositing.
              </p>
            </div>
          )}

          {/* Spending limits (advanced) */}
          <div className='grid gap-3'>
            <button
              type='button'
              onClick={() => setShowLimits(!showLimits)}
              disabled={isSubmitting}
              className='text-sm text-primary text-left w-fit hover:underline'
            >
              {showLimits ? "Hide spending limits" : "Set spending limits (optional)"}
            </button>
            {showLimits && (
              <div className='grid gap-3 rounded-lg border p-3'>
                <label className='flex items-center gap-2 text-sm cursor-pointer'>
                  <input
                    type='checkbox'
                    checked={isUnlimited}
                    onChange={(e) => setIsUnlimited(e.target.checked)}
                    className='rounded'
                    disabled={isSubmitting}
                  />
                  No spending limit (default)
                </label>
                <div className='grid grid-cols-2 gap-3'>
                  <div className='grid gap-2'>
                    <Label htmlFor='lockupAllowance' className='text-xs text-muted-foreground'>
                      Reserve limit{tokenDetails ? ` (${tokenDetails.symbol})` : ""}
                    </Label>
                    <Input
                      id='lockupAllowance'
                      type='number'
                      placeholder='0.0'
                      value={lockupAllowance}
                      onChange={setLockupAllowance}
                      disabled={isUnlimited || isSubmitting}
                    />
                  </div>
                  <div className='grid gap-2'>
                    <Label htmlFor='rateAllowance' className='text-xs text-muted-foreground'>
                      Rate limit{tokenDetails ? ` (${tokenDetails.symbol} per epoch)` : ""}
                    </Label>
                    <Input
                      id='rateAllowance'
                      type='number'
                      placeholder='0.0'
                      value={rateAllowance}
                      onChange={setRateAllowance}
                      disabled={isUnlimited || isSubmitting}
                    />
                  </div>
                </div>
                <p className='text-xs text-muted-foreground'>
                  Advanced. Limits cap how much the service can reserve and charge; most users keep this unlimited and
                  rely on removing the service instead.
                </p>
              </div>
            )}
          </div>

          <p className='text-xs text-muted-foreground'>
            The service may reserve up to 30 days of upcoming charges from your deposit. You can remove it at any time.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant='ghost'
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting || isExecuting}
            size='compact'
          >
            Cancel
          </Button>
          <Button variant='primary' onClick={handleSubmit} disabled={!canSubmit} size='compact'>
            {isSubmitting || isExecuting ? (
              <span className='flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin mr-2' />
                Processing…
              </span>
            ) : isDepositing ? (
              "Deposit and Add Service"
            ) : (
              "Add Service"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddServiceDialog;
