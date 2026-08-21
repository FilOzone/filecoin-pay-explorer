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
import { useEffect, useEffectEvent, useState } from "react";
import { erc20Abi, formatUnits, type Hex, isAddress, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWalletClient } from "wagmi";
import DepositTokenPicker, {
  type CustomTokenStatus,
  type PickerToken,
  type TokenPickerMode,
} from "@/components/UserConsole/DepositTokenPicker";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import useSynapse from "@/hooks/useSynapse";
import { getPermitSignature } from "@/utils/permit";

const PERMIT_DEADLINE_SECONDS = 3600;

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

  const { synapse, constants } = useSynapse();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const { execute, isExecuting } = useContractTransaction({
    contractAddress: constants.contracts.payments.address,
    abi: constants.contracts.payments.abi,
    explorerUrl: constants.chain.blockExplorers?.default.url,
  });

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
        ]
      : [],
    query: {
      enabled: Boolean(customTokenAddress) && open,
    },
  });

  // Results come back positionally, in the order the contracts are listed above.
  const [symbolRead, decimalsRead] = tokenReads ?? [];

  /** A token resolved purely from chain reads — the custom-address path. */
  const chainToken: PickerToken | null =
    customTokenAddress && symbolRead?.status === "success" && decimalsRead?.status === "success"
      ? {
          address: customTokenAddress,
          symbol: symbolRead.result as string,
          decimals: Number(decimalsRead.result),
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

  const customTokenStatus: CustomTokenStatus = !trimmedCustomAddress
    ? "idle"
    : !isCustomAddressValid
      ? "invalid"
      : isLoadingTokenReads
        ? "loading"
        : isTokenReadsError || !chainToken
          ? "error"
          : "loaded";

  const { data: balance, isLoading: isLoadingBalance } = useReadContract({
    address: activeTokenAddress || undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: Boolean(activeTokenAddress) && Boolean(userAddress) && open,
    },
  });

  // Amounts are denominated in the token that was on screen when they were
  // typed, so any change of token clears the field rather than reinterpreting it.
  const handleSelectToken = (userToken: UserToken) => {
    setSelectedUserToken(userToken);
    setCustomAddress("");
    setAmount("");
    setPickerMode("collapsed");
  };

  const handleModeChange = (mode: TokenPickerMode) => {
    if (mode === "custom") {
      setSelectedUserToken(null);
      setAmount("");
    }

    setPickerMode(mode);
  };

  const handleCustomAddressChange = (value: string) => {
    setCustomAddress(value);
    setAmount("");
  };

  const handleClose = () => {
    if (!isExecuting) {
      onOpenChange(false);
      // State will be reset by useEffect when open becomes false
    }
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

    try {
      const amountInWei = parseUnits(amount, currentToken.decimals);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS);

      console.log("[Deposit] Getting permit signature...");

      const permitSignature = await getPermitSignature(
        {
          tokenAddress: currentToken.address as Hex,
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
        onSubmitOnChain: () => handleClose(),
      });
    } catch (err) {
      console.error("Deposit failed:", err);
    }
  };

  const canDeposit = Boolean(currentToken) && Boolean(amount) && !isExecuting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Capped and scrollable like SettleRailDialog: the dialog is fixed and
          vertically centred, so without a bound tall content pushes the title and
          footer past the edges of a short viewport. */}
      <DialogContent className='flex max-h-[90vh] flex-col sm:max-w-[500px]'>
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
            disabled={isExecuting}
          />

          {currentToken ? (
            <div className='grid gap-2'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='amount'>Amount</Label>
                {balance !== undefined || isLoadingBalance ? (
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
          ) : null}
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
