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
import { Loader2, Wallet } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { erc20Abi, formatUnits, type Hex, isAddress, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWalletClient } from "wagmi";
import DepositTokenPicker, {
  type CustomTokenStatus,
  type PickerToken,
  type TokenPickerMode,
} from "@/components/UserConsole/DepositTokenPicker";
import { FundingRunwaySlider, RunwayCard } from "@/components/UserConsole/FundsSection/components/RunwayCard";
import {
  calculateFundingRunway,
  calculateProjectedFundingRunway,
  defaultTopUpSuggestion,
  ONE_YEAR_EPOCHS,
} from "@/components/UserConsole/FundsSection/data/funding-runway";
import { parseTopUpAmount } from "@/components/UserConsole/FundsSection/data/guided-top-up";
import useAccountSummary from "@/hooks/useAccountSummary";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import useSynapse from "@/hooks/useSynapse";
import { getPermitSignature } from "@/utils/permit";

const PERMIT_DEADLINE_SECONDS = 3600;

/**
 * How far the hand-entered address has got towards a usable token.
 *
 * The checks are ordered by precedence and each one assumes those above it
 * passed, so an empty field never reports as invalid and an in-flight read never
 * reports as an error. `loaded` is the only state left once every check clears.
 */
const getCustomTokenStatus = ({
  address,
  isValidAddress,
  isLoadingReads,
  isReadsError,
  token,
}: {
  /** The trimmed contract address as typed. */
  address: string;
  isValidAddress: boolean;
  isLoadingReads: boolean;
  isReadsError: boolean;
  /** The token those reads resolved to, or null if they did not resolve one. */
  token: PickerToken | null;
}): CustomTokenStatus => {
  if (!address) return "idle";
  if (!isValidAddress) return "invalid";
  if (isLoadingReads) return "loading";
  // A well-formed address that resolves nothing is an error too: the reads came
  // back, but not from something this dialog can deposit.
  if (isReadsError || !token) return "error";
  return "loaded";
};

type DepositDialogProps = {
  /**
   * Seeds the initial selection only. The dialog owns its selection after that,
   * so a later change to this prop must not swap the target of a part-filled form.
   */
  depositToken?: UserToken | null;
  /** Tokens already held by the account, resolved by the caller. */
  tokens: UserToken[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const DepositDialog = ({ depositToken, tokens, open, onOpenChange }: DepositDialogProps) => {
  const { address: userAddress } = useAccount();

  const [amount, setAmount] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [selectedUserToken, setSelectedUserToken] = useState<UserToken | null>(null);
  const [pickerMode, setPickerMode] = useState<TokenPickerMode>("collapsed");
  const didPrefillAmount = useRef(false);
  /**
   * Covers the whole of `handleDeposit`, which `isExecuting` does not: that only
   * turns true once `execute` reaches `writeContract`, leaving the permit
   * signature — an open wallet prompt, for as long as the user takes — a window
   * where the form still looked idle and every click started another prompt.
   */
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { synapse, constants } = useSynapse();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const { execute, isExecuting } = useContractTransaction({
    contractAddress: constants.contracts.payments.address,
    abi: constants.contracts.payments.abi,
    explorerUrl: constants.chain.blockExplorers?.default.url,
  });

  /** The form is locked from the first click through to the receipt. */
  const isBusy = isSubmitting || isExecuting;

  /**
   * Reads `depositToken` at the moment the dialog opens without making it a
   * dependency of the effect below. The prop seeds the selection once; it is not
   * a live binding, so a later change to it must not swap the target of a
   * part-filled form.
   */
  const seedSelection = useEffectEvent(() => {
    const seedToken = depositToken ?? null;
    setSelectedUserToken(seedToken);
    // Without a preselected token there is nothing to collapse, and the first
    // thing the user has to do is pick one — so open on the list.
    setPickerMode(seedToken ? "collapsed" : "list");
  });

  // Seed on open, reset on close — including the picker's own expanded state.
  useEffect(() => {
    if (open) {
      seedSelection();
      return;
    }

    setAmount("");
    setCustomAddress("");
    setSelectedUserToken(null);
    setPickerMode("collapsed");
    setIsSubmitting(false);
    didPrefillAmount.current = false;
  }, [open]);

  const trimmedCustomAddress = customAddress.trim();
  const isCustomAddressValid = isAddress(trimmedCustomAddress);

  /**
   * Set only on the custom-address path. A token picked from the account list
   * already carries its symbol and decimals from the subgraph, so reading those
   * back off-chain would be a multicall that changes nothing on screen.
   *
   * The two sources are mutually exclusive (see the handlers below); the
   * `selectedUserToken` guard states that here rather than relying on it.
   */
  const customTokenAddress: Hex | null =
    !selectedUserToken && isCustomAddressValid ? (trimmedCustomAddress as Hex) : null;

  /** Whichever token the deposit acts on. Its wallet balance is only knowable on-chain. */
  const activeTokenAddress: Hex | null = selectedUserToken ? (selectedUserToken.token.id as Hex) : customTokenAddress;

  /**
   * `allowFailure` is left at its default of `true`, so results arrive as
   * `{ status, result }` rather than bare values.
   */
  const {
    data: tokenReads,
    isLoading: isLoadingTokenReads,
    isError: isTokenReadsError,
  } = useReadContracts({
    contracts: customTokenAddress
      ? [
          { address: customTokenAddress, abi: erc20Abi, functionName: "symbol" },
          { address: customTokenAddress, abi: erc20Abi, functionName: "decimals" },
          { address: customTokenAddress, abi: erc20Abi, functionName: "name" },
        ]
      : [],
    query: {
      enabled: Boolean(customTokenAddress) && open,
    },
  });

  // Results come back positionally, in the order the contracts are listed above.
  const [symbolRead, decimalsRead, nameRead] = tokenReads ?? [];

  /**
   * A token resolved purely from chain reads — the custom-address path.
   *
   * All three reads must succeed, `name` included. That is not a display
   * preference: this dialog deposits through `depositWithPermit`, and the EIP-712
   * domain in `getPermitSignature` is built from the token's `name()`. A token
   * that has none cannot be signed for, so resolving it here would only arm a
   * Deposit button that fails after the click.
   */
  const chainToken: PickerToken | null =
    customTokenAddress &&
    symbolRead?.status === "success" &&
    decimalsRead?.status === "success" &&
    nameRead?.status === "success"
      ? {
          address: customTokenAddress,
          symbol: symbolRead.result as string,
          decimals: Number(decimalsRead.result),
          name: nameRead.result as string,
        }
      : null;

  // A token from the account list already carries its metadata, so it renders
  // immediately instead of waiting on the multicall.
  const currentToken: PickerToken | null = selectedUserToken
    ? {
        address: selectedUserToken.token.id,
        symbol: selectedUserToken.token.symbol,
        decimals: Number(selectedUserToken.token.decimals),
      }
    : chainToken;

  const customTokenStatus = getCustomTokenStatus({
    address: trimmedCustomAddress,
    isValidAddress: isCustomAddressValid,
    isLoadingReads: isLoadingTokenReads,
    isReadsError: isTokenReadsError,
    token: chainToken,
  });

  const { data: balance, isLoading: isLoadingBalance } = useReadContract({
    address: activeTokenAddress || undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: Boolean(activeTokenAddress) && Boolean(userAddress) && open,
    },
  });

  const isUsdfcDeposit = currentToken?.address.toLowerCase() === constants.contracts.usdfc.toLowerCase();
  const { data: accountSummary, isFetching: isAccountSummaryLoading } = useAccountSummary({
    address: userAddress,
    chainId: constants.chain.id,
    enabled: open && isUsdfcDeposit,
  });

  // Amounts are denominated in the token that was on screen when they were
  // typed, so any change of token clears the field rather than reinterpreting it.
  const handleSelectToken = (userToken: UserToken) => {
    setSelectedUserToken(userToken);
    setCustomAddress("");
    setAmount("");
    setPickerMode("collapsed");
    didPrefillAmount.current = false;
  };

  const handleModeChange = (mode: TokenPickerMode) => {
    if (mode === "custom") {
      setSelectedUserToken(null);
      setAmount("");
      didPrefillAmount.current = false;
    }

    setPickerMode(mode);
  };

  const handleCustomAddressChange = (value: string) => {
    setCustomAddress(value);
    setAmount("");
    didPrefillAmount.current = false;
  };

  /**
   * The single gate for every user-initiated close: the X, Escape, an outside
   * click and Cancel all arrive here.
   *
   * Closing while busy is refused rather than ignored, because closing does not
   * cancel anything — an in-flight permit signature resolves regardless and goes
   * on to submit. A dismissed dialog must not be able to move funds.
   *
   * The close that follows a submitted transaction deliberately does not come
   * through here; see `onSubmitOnChain` below.
   */
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isBusy) return;
    onOpenChange(nextOpen);
  };

  const handleMaxClick = () => {
    if (balance !== undefined && currentToken) {
      setAmount(formatUnits(balance, currentToken.decimals));
    }
  };

  const handleDeposit = async () => {
    if (!currentToken) {
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

    setIsSubmitting(true);

    try {
      const amountInWei = parseUnits(amount, currentToken.decimals);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS);

      console.log("[Deposit] Getting permit signature...");

      const permitSignature = await getPermitSignature(
        {
          tokenAddress: currentToken.address as Hex,
          // Set only for a token resolved from chain reads, where this is the
          // contract's own `name()` and so the exact string the EIP-712 domain
          // needs. Account-list tokens leave it undefined on purpose: their name
          // comes from the subgraph, which stores "Unknown" for a reverting
          // `name()`, and a domain built on that would produce a signature the
          // token rejects. `getPermitSignature` re-reads it from chain instead.
          tokenName: currentToken.name,
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

      await execute({
        functionName: "depositWithPermit",
        args: [
          currentToken.address,
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
          token: currentToken.symbol,
        },
        // The one close that must succeed while busy: the transaction is away and
        // the toast tracks it from here. Bypasses the guard above on purpose.
        onSubmitOnChain: () => onOpenChange(false),
      });
    } catch (err) {
      console.error("Deposit failed:", err);
    } finally {
      // Releases the permit half of the lock. `isExecuting` carries `isBusy` on
      // its own from here until the receipt lands.
      setIsSubmitting(false);
    }
  };

  const canDeposit = Boolean(currentToken) && Boolean(amount) && !isBusy;

  const runwayCurrent =
    isUsdfcDeposit && accountSummary
      ? calculateFundingRunway(accountSummary, ONE_YEAR_EPOCHS, constants.chain.genesisTimestamp)
      : null;
  const usdfcDepositAmount = isUsdfcDeposit ? parseTopUpAmount(amount) : null;
  const runwayProjected =
    accountSummary && runwayCurrent && usdfcDepositAmount !== null
      ? calculateProjectedFundingRunway(
          accountSummary,
          usdfcDepositAmount,
          ONE_YEAR_EPOCHS,
          constants.chain.genesisTimestamp,
        )
      : null;
  const defaultSuggestion =
    isUsdfcDeposit && accountSummary && balance !== undefined
      ? defaultTopUpSuggestion(accountSummary, constants.chain.genesisTimestamp, balance)
      : "";

  useEffect(() => {
    if (!open || !defaultSuggestion || didPrefillAmount.current) return;
    didPrefillAmount.current = true;
    setAmount((previous) => (previous === "" ? defaultSuggestion : previous));
  }, [defaultSuggestion, open]);

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className='flex max-h-[90vh] flex-col sm:max-w-[500px]'
        // The guard in `handleDialogOpenChange` already refuses these closes, but
        // stopping them at the source means no dismissal is even attempted while
        // a signature is pending, and the missing X says so before it is tried.
        showCloseButton={!isBusy}
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isBusy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Deposit tokens</DialogTitle>
          <DialogDescription>Choose a token and deposit it into your Filecoin Pay account.</DialogDescription>
        </DialogHeader>

        {/* `min-h-0` lets this shrink below its content so `overflow-y-auto` engages. */}
        <div className='grid min-h-0 gap-4 overflow-y-auto py-4'>
          <DepositTokenPicker
            tokens={tokens}
            token={currentToken}
            mode={pickerMode}
            onModeChange={handleModeChange}
            onSelectToken={handleSelectToken}
            customAddress={customAddress}
            onCustomAddressChange={handleCustomAddressChange}
            customTokenStatus={customTokenStatus}
            chainName={constants.chain.name}
            disabled={isBusy}
          />

          {currentToken ? (
            <div className='grid gap-2'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='amount'>Amount</Label>
                {balance !== undefined || isLoadingBalance ? (
                  // `min-w-0` down the chain so the symbol — arbitrary text from a
                  // hand-entered contract — clips instead of widening the row.
                  <div className='flex min-w-0 items-center gap-2 text-xs text-muted-foreground'>
                    <Wallet className='h-3 w-3 shrink-0' />
                    <span className='min-w-0 truncate'>
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
                ) : null}
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
                  disabled={isBusy}
                  className='text-lg pr-16'
                />
                <Button
                  type='button'
                  variant='ghost'
                  className='absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs font-semibold'
                  onClick={handleMaxClick}
                  disabled={isBusy || balance === undefined || isLoadingBalance}
                >
                  MAX
                </Button>
              </div>
              {/* Wraps rather than truncates: this line has the width to spare,
                  and `break-words` keeps an unbroken symbol from widening it. */}
              <p className='break-words text-xs text-muted-foreground'>
                Enter the amount of {currentToken.symbol} you want to deposit
              </p>
            </div>
          ) : null}

          {isUsdfcDeposit && accountSummary && runwayCurrent ? (
            <>
              <FundingRunwaySlider
                accountSummary={accountSummary}
                amount={amount}
                disabled={isBusy}
                genesisTimestamp={constants.chain.genesisTimestamp}
                maxAmount={balance}
                onSelect={setAmount}
              />
              <RunwayCard current={runwayCurrent} projected={runwayProjected}>
                <p className='text-muted-foreground'>Target deposit: {amount || "—"} USDFC.</p>
              </RunwayCard>
            </>
          ) : isUsdfcDeposit && isAccountSummaryLoading ? (
            <p className='text-sm text-muted-foreground'>Loading funding runway…</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant='ghost' onClick={() => handleDialogOpenChange(false)} disabled={isBusy} size='compact'>
            Cancel
          </Button>
          <Button variant='primary' onClick={handleDeposit} disabled={!canDeposit} size='compact'>
            {isBusy ? (
              <span className='inline-flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' />
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
