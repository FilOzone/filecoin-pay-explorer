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
import { useEffect, useRef, useState } from "react";
import { formatUnits, maxUint256, parseUnits } from "viem";
import CopyButton from "@/components/shared/CopyButton";
import TokenIcon from "@/components/shared/TokenIcon";
import { useFundingLaunch } from "@/components/UserConsole/FundingLaunchContext";
import { FIL_GAS_TOP_UP_AMOUNT } from "@/components/UserConsole/FundsSection/data/squid-deposit-route";
import type { ApprovableService } from "@/hooks/useApprovableServices";
import useSynapse from "@/hooks/useSynapse";
import { formatAddress } from "@/utils/formatter";
import {
  CUSTOM_OPTION,
  useAddServiceSubmit,
  useFilecoinGasBalance,
  useServiceSelection,
  useTokenSelection,
} from "./hooks";

interface AddServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  const serviceSelection = useServiceSelection();
  const tokenSelection = useTokenSelection(open);
  const [isCheckingGas, setIsCheckingGas] = useState(false);
  const gasCheckInFlight = useRef(false);
  const { submit, isSubmitting, isExecuting } = useAddServiceSubmit(() => onOpenChange(false));
  const isBusy = isCheckingGas || isSubmitting || isExecuting;
  const gasBalance = useFilecoinGasBalance(open);
  const funding = useFundingLaunch();
  const formOwner = useRef(gasBalance.owner);
  const currentGasContext = useRef({
    owner: gasBalance.owner,
    isCorrectChain: gasBalance.isCorrectChain,
    generation: 0,
  });
  if (
    currentGasContext.current.owner !== gasBalance.owner ||
    currentGasContext.current.isCorrectChain !== gasBalance.isCorrectChain
  ) {
    currentGasContext.current = {
      owner: gasBalance.owner,
      isCorrectChain: gasBalance.isCorrectChain,
      generation: currentGasContext.current.generation + 1,
    };
  }
  const previousSquidOpen = useRef(funding.isSquidOpen);

  const [depositAmount, setDepositAmount] = useState("");

  // Spending limits are an advanced disclosure; the default grant is unlimited.
  const [showLimits, setShowLimits] = useState(false);
  const [isUnlimited, setIsUnlimited] = useState(true);
  const [lockupAllowance, setLockupAllowance] = useState("");
  const [rateAllowance, setRateAllowance] = useState("");

  const { constants } = useSynapse();
  const explorerUrl = constants.chain.blockExplorers?.default.url;
  const filFaucet = constants.faucets?.find((faucet) => faucet.name.toLowerCase().includes("fil"));
  const requiredFil = formatUnits(FIL_GAS_TOP_UP_AMOUNT, 18);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the reset closures are recreated each render; visibility and owner are the real dependencies
  useEffect(() => {
    const ownerChanged = formOwner.current !== gasBalance.owner;
    formOwner.current = gasBalance.owner;
    if (!open || ownerChanged) {
      serviceSelection.reset();
      tokenSelection.reset();
      setDepositAmount("");
      setShowLimits(false);
      setIsUnlimited(true);
      setLockupAllowance("");
      setRateAllowance("");
    }
  }, [open, gasBalance.owner]);

  useEffect(() => {
    if (previousSquidOpen.current && !funding.isSquidOpen) void gasBalance.refresh();
    previousSquidOpen.current = funding.isSquidOpen;
  }, [funding.isSquidOpen, gasBalance.refresh]);

  const { services, isLoadingServices, serviceChoice, selectedService, operatorAddress } = serviceSelection;
  const { token, supportsPermit, balance, isLoadingBalance } = tokenSelection;

  // Amounts are denominated in the token that was on screen when they were
  // typed, so any change of token clears the field rather than reinterpreting it.
  const clearAmounts = () => {
    setDepositAmount("");
    setLockupAllowance("");
    setRateAllowance("");
  };

  const parsedDeposit = (() => {
    if (!depositAmount.trim() || !token) return null;
    try {
      return parseUnits(depositAmount.trim(), token.decimals);
    } catch {
      return null;
    }
  })();
  const isDepositing = parsedDeposit !== null && parsedDeposit > 0n;

  // Parsed like the deposit amount: <input type=number> accepts values viem
  // rejects (e.g. 1e5), and an uncaught parseUnits throw in submit would abort
  // with no UI feedback.
  const parseLimit = (input: string): bigint | null => {
    if (!input.trim()) return 0n;
    if (!token) return null;
    try {
      return parseUnits(input.trim(), token.decimals);
    } catch {
      return null;
    }
  };
  const lockupInWei = isUnlimited ? maxUint256 : parseLimit(lockupAllowance);
  const rateInWei = isUnlimited ? maxUint256 : parseLimit(rateAllowance);
  // A 0-rate/0-lockup grant is an on-chain no-op that still costs gas —
  // switching off the unlimited default requires a real limit.
  const areLimitsValid =
    lockupInWei !== null &&
    rateInWei !== null &&
    lockupInWei >= 0n &&
    rateInWei >= 0n &&
    (isUnlimited || lockupInWei > 0n || rateInWei > 0n);

  const isOperatorValid = !!operatorAddress;
  const isDepositValid = !depositAmount.trim() || (isDepositing && supportsPermit);
  // Nothing simulates the call client-side, so an over-balance deposit would
  // collect a permit signature and then revert on the ERC-20 transfer.
  const hasSufficientBalance =
    !isDepositing || (balance !== undefined && parsedDeposit !== null && parsedDeposit <= balance);
  const canSubmit =
    isOperatorValid &&
    !!token &&
    isDepositValid &&
    hasSufficientBalance &&
    areLimitsValid &&
    gasBalance.status === "funded" &&
    gasBalance.isCorrectChain &&
    formOwner.current === gasBalance.owner &&
    !isBusy;

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isBusy) return;
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    if (gasCheckInFlight.current || !operatorAddress || !token || lockupInWei === null || rateInWei === null) return;
    const submittingOwner = gasBalance.owner;
    const contextGeneration = currentGasContext.current.generation;
    gasCheckInFlight.current = true;
    setIsCheckingGas(true);
    try {
      const refreshedStatus = await gasBalance.refresh();
      if (
        refreshedStatus !== "funded" ||
        currentGasContext.current.generation !== contextGeneration ||
        currentGasContext.current.owner !== submittingOwner ||
        !currentGasContext.current.isCorrectChain
      )
        return;
      await submit({
        operatorAddress,
        token,
        parsedDeposit,
        depositAmountLabel: depositAmount,
        lockupInWei,
        rateInWei,
      });
    } finally {
      gasCheckInFlight.current = false;
      setIsCheckingGas(false);
    }
  };

  return (
    <Dialog open={open && !funding.isSquidOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className='sm:max-w-[600px] max-h-[90vh] overflow-y-auto'
        showCloseButton={!isBusy}
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isBusy) event.preventDefault();
        }}
      >
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
            <Select value={serviceChoice} onValueChange={serviceSelection.setServiceChoice} disabled={isBusy}>
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
                  value={serviceSelection.customServiceInput}
                  onChange={serviceSelection.setCustomServiceInput}
                  disabled={isBusy}
                />
                {serviceSelection.customServiceInput &&
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
            <Select
              value={tokenSelection.tokenChoice}
              onValueChange={(value) => {
                tokenSelection.setTokenChoice(value);
                clearAmounts();
              }}
              disabled={isBusy}
            >
              <SelectTrigger id='paymentToken' className='w-full'>
                <SelectValue placeholder='Choose a token…' />
              </SelectTrigger>
              <SelectContent>
                {tokenSelection.knownTokens.map((knownToken) => (
                  <SelectItem key={knownToken.address} value={knownToken.address}>
                    <span className='flex items-center gap-2'>
                      <TokenIcon token={knownToken} className='size-5' />
                      <span>{knownToken.symbol}</span>
                      <span className='font-mono text-xs text-muted-foreground'>
                        ({formatAddress(knownToken.address)})
                      </span>
                    </span>
                  </SelectItem>
                ))}
                {tokenSelection.knownTokens.length > 0 && <SelectSeparator />}
                <SelectItem value={CUSTOM_OPTION}>Custom token address…</SelectItem>
              </SelectContent>
            </Select>

            {tokenSelection.tokenChoice === CUSTOM_OPTION && (
              <Input
                id='customToken'
                placeholder='Token contract address 0x…'
                value={tokenSelection.customTokenInput}
                onChange={(value) => {
                  tokenSelection.setCustomTokenInput(value);
                  clearAmounts();
                }}
                disabled={isBusy}
              />
            )}
            {tokenSelection.customTokenState === "invalid" && (
              <div className='flex items-center gap-2 text-sm text-destructive'>
                <AlertCircle className='h-4 w-4' />
                <span>Invalid token address</span>
              </div>
            )}
            {tokenSelection.customTokenState === "loading" && (
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <Loader2 className='h-4 w-4 animate-spin' />
                <span>Loading token details…</span>
              </div>
            )}
            {tokenSelection.customTokenState === "error" && (
              <div className='flex items-center gap-2 text-sm text-destructive'>
                <AlertCircle className='h-4 w-4' />
                <span>Couldn't read this token. Check it is an ERC-20 contract on the connected network.</span>
              </div>
            )}
            {tokenSelection.customTokenState === "loaded" && token && (
              <div className='flex items-center gap-2 text-sm text-green-600 dark:text-green-400'>
                <CheckCircle2 className='h-4 w-4' />
                <span>
                  {token.symbol} · {token.decimals} decimals
                </span>
              </div>
            )}

            {token && (
              <div className='flex items-center gap-1 text-xs text-muted-foreground'>
                <span>Token contract:</span>
                {explorerUrl ? (
                  <a
                    href={`${explorerUrl}/address/${token.address}`}
                    target='_blank'
                    rel='noreferrer'
                    className='font-mono text-primary hover:underline'
                  >
                    {formatAddress(token.address)}
                  </a>
                ) : (
                  <span className='font-mono'>{formatAddress(token.address)}</span>
                )}
                <CopyButton value={token.address} tooltipText='Copy token contract address' />
              </div>
            )}
          </div>

          {/* Deposit amount */}
          {token && !supportsPermit && (
            <p className='flex items-center gap-2 text-xs text-muted-foreground'>
              <AlertCircle className='h-4 w-4 shrink-0 text-amber-500' />
              This token doesn't support gasless deposits (EIP-2612). Add the service now and deposit this token
              separately.
            </p>
          )}
          {token && supportsPermit && (
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
                          {Number(formatUnits(balance, token.decimals)).toLocaleString(undefined, {
                            maximumFractionDigits: 6,
                          })}{" "}
                          {token.symbol}
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
                  disabled={isBusy}
                  className='text-lg pr-16'
                />
                <Button
                  type='button'
                  variant='ghost'
                  className='absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs font-semibold'
                  onClick={() => {
                    if (balance !== undefined) setDepositAmount(formatUnits(balance, token.decimals));
                  }}
                  disabled={isBusy || balance === undefined || isLoadingBalance}
                >
                  MAX
                </Button>
              </div>
              {isDepositing && balance !== undefined && !hasSufficientBalance && (
                <p className='flex items-center gap-2 text-xs text-destructive'>
                  <AlertCircle className='h-3.5 w-3.5 shrink-0' />
                  Insufficient balance for this deposit.
                </p>
              )}
              {!!depositAmount.trim() && !isDepositing && (
                <p className='flex items-center gap-2 text-xs text-destructive'>
                  <AlertCircle className='h-3.5 w-3.5 shrink-0' />
                  Enter a valid amount.
                </p>
              )}
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
              disabled={isBusy}
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
                    disabled={isBusy}
                  />
                  No spending limit (default)
                </label>
                <div className='grid grid-cols-2 gap-3'>
                  <div className='grid gap-2'>
                    <Label htmlFor='lockupAllowance' className='text-xs text-muted-foreground'>
                      Reserve limit{token ? ` (${token.symbol})` : ""}
                    </Label>
                    <Input
                      id='lockupAllowance'
                      type='number'
                      placeholder='0.0'
                      value={lockupAllowance}
                      onChange={setLockupAllowance}
                      min='0'
                      disabled={isUnlimited || isBusy}
                    />
                  </div>
                  <div className='grid gap-2'>
                    <Label htmlFor='rateAllowance' className='text-xs text-muted-foreground'>
                      Rate limit{token ? ` (${token.symbol} per epoch)` : ""}
                    </Label>
                    <Input
                      id='rateAllowance'
                      type='number'
                      placeholder='0.0'
                      value={rateAllowance}
                      onChange={setRateAllowance}
                      min='0'
                      disabled={isUnlimited || isBusy}
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

          {!gasBalance.isCorrectChain ? (
            <div className='flex items-center justify-between gap-3 rounded-lg border p-3 text-sm' role='alert'>
              <span className='inline-flex items-start gap-2'>
                <AlertCircle className='mt-0.5 h-4 w-4 shrink-0 text-amber-500' />
                Switch back to {constants.label} before adding this service.
              </span>
              <Button
                disabled={gasBalance.isSwitchingNetwork}
                onClick={gasBalance.switchToFilecoin}
                size='compact'
                type='button'
                variant='primary'
              >
                {gasBalance.isSwitchingNetwork ? "Switching…" : `Switch to ${constants.label}`}
              </Button>
            </div>
          ) : gasBalance.status === "loading" ? (
            <p className='inline-flex items-center gap-2 text-sm text-muted-foreground' role='status'>
              <Loader2 className='h-4 w-4 animate-spin' /> Checking FIL balance…
            </p>
          ) : gasBalance.status === "unavailable" ? (
            <div className='flex items-center justify-between gap-3 rounded-lg border p-3 text-sm' role='alert'>
              <span className='inline-flex items-start gap-2'>
                <AlertCircle className='mt-0.5 h-4 w-4 shrink-0 text-amber-500' />
                Your FIL balance could not be loaded. Retry before adding the service.
              </span>
              <Button onClick={() => void gasBalance.refresh()} size='compact' type='button' variant='tertiary'>
                Retry
              </Button>
            </div>
          ) : gasBalance.status === "insufficient" ? (
            <div className='flex items-center justify-between gap-3 rounded-lg border p-3 text-sm' role='alert'>
              <span className='inline-flex items-start gap-2'>
                <AlertCircle className='mt-0.5 h-4 w-4 shrink-0 text-amber-500' />
                Add at least {requiredFil} FIL for transaction fees before adding this service.
              </span>
              {constants.chain.slug === "mainnet" ? (
                <Button onClick={funding.openSquid} size='compact' type='button' variant='primary'>
                  Add FIL
                </Button>
              ) : filFaucet ? (
                <a
                  className='font-medium text-primary hover:underline'
                  href={filFaucet.url}
                  rel='noreferrer'
                  target='_blank'
                >
                  Get testnet FIL
                </a>
              ) : null}
            </div>
          ) : null}

          <p className='text-xs text-muted-foreground'>
            The service may reserve up to 30 days of upcoming charges from your deposit. You can remove it at any time.
          </p>
        </div>

        <DialogFooter>
          <Button variant='ghost' onClick={() => handleDialogOpenChange(false)} disabled={isBusy} size='compact'>
            Cancel
          </Button>
          <Button variant='primary' onClick={() => void handleSubmit()} disabled={!canSubmit} size='compact'>
            {isBusy ? (
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
