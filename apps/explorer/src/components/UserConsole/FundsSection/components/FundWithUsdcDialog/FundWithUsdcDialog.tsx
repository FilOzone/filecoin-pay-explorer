"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { ExternalTextLink } from "@filecoin-foundation/ui-filecoin/TextLink/ExternalTextLink";
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
  useAddFunds,
  useConnectWallet,
  useFiatOnramp,
  useFundWallet,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";
import { formatUnits } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { isPrivyEmbeddedWallet } from "@/components/UserConsole/console-wallet";
import {
  BASE_CHAIN_ID,
  buildCardOnrampOptions,
  CARD_ONRAMP_CHAIN_IDS,
  readOnrampEnvironment,
  runPrivyFunding,
  toCaipChainId,
} from "@/components/UserConsole/privy-funding";
import { useTopUpActivity } from "@/components/UserConsole/TopUpActivityContext";
import { useTransactionReview } from "@/components/UserConsole/TransactionReview";
import { mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { formatAddress } from "@/utils/formatter";
import { createDialogCloseGuard } from "../../data/dialog-close-guard";
import { formatUsdfcAmount } from "../../data/funding-runway";
import { getDepositAfterFilGasTopUp } from "../../data/squid-deposit-route";
import { readSquidIntegratorId } from "../../data/squid-integrator";
import { squidFetch } from "../../data/squid-quote";
import {
  findCardUsdcToken,
  findUsdcSourceCovering,
  formatUsdcBalance,
  isSameUsdcSource,
  pickDefaultUsdcSource,
  type UsdcSourceChoice,
} from "../../data/usdc-sources";
import { DepositProgress } from "./DepositProgress";
import { pickFundingHelper } from "./funding-helper";
import { PaymentSourceFields } from "./PaymentSourceFields";
import { PendingDepositPanel } from "./PendingDepositPanel";
import { GasShortfallPanel, TopUpWalletPanel } from "./PrivyFundingPanels";
import { QuoteSummary } from "./QuoteSummary";
import { useSquidDepositExecution } from "./useSquidDepositExecution";
import { useSquidDepositQuote } from "./useSquidDepositQuote";
import { useUsdcBalancesAcrossChains } from "./useUsdcBalancesAcrossChains";
import { describeWallet, formatTokenAmount, pickDefaultWallet } from "./wallets";

const QUOTE_DEBOUNCE_MS = 500;
// Until the scan finds USDC somewhere: Base has the cheapest gas among the
// Squid source networks and is where Privy's funding flows deliver USDC.
const FALLBACK_SOURCE: UsdcSourceChoice = { chainId: BASE_CHAIN_ID, token: "" };
// Where a card purchase or transfer can land and still be paid from here, Base first as the cheapest.
const CARD_CHAINS = CARD_ONRAMP_CHAIN_IDS.flatMap((id) => SQUID_SOURCE_CHAINS.filter((chain) => chain.id === id));
const DEPOSIT_CONTRACTS = { payments: mainnet.contracts.payments.address, usdfc: mainnet.contracts.usdfc.address };

type FundWithUsdcDialogProps = {
  accountId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

/**
 * Pays USDC from any connected wallet and lands it as USDFC in the Filecoin
 * Pay account. This component owns what the user is choosing (wallet, USDC
 * source, amount) and the Privy top-up flows; the scan hook owns where the
 * wallet's USDC is, the quote hook what the choice costs, and the execution
 * hook what happens after confirm.
 */
export function FundWithUsdcDialog({ accountId, onOpenChange, open }: FundWithUsdcDialogProps) {
  const { address: recipient } = useAccount();
  const { ready: areWalletsReady, wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const { addFunds } = useAddFunds();
  const { fund: fundWithCard } = useFiatOnramp();
  // Every Privy funding flow (card, transfer picker, gas) needs a Privy session,
  // so a connect-only wallet is asked to log in first.
  const { authenticated: hasPrivyLogin, login } = usePrivy();
  const { fundWallet } = useFundWallet();
  const { setTopUpActive } = useTopUpActivity();
  const { requestReview, reviewDialog } = useTransactionReview();
  const amountInputId = useId();

  const [payingAddress, setPayingAddress] = useState("");
  // The user's own pick, if any; otherwise the source holding the most USDC.
  const [chosenSource, setChosenSource] = useState<UsdcSourceChoice | null>(null);
  // Where bought or transferred USDC should land; follows the paying network until the user picks.
  const [chosenCardChainId, setChosenCardChainId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [debouncedAmount] = useDebounce(amount, QUOTE_DEBOUNCE_MS);
  const [isFunding, setIsFunding] = useState(false);
  // The source (wallet, network, token) shows as one line until the user wants to change it.
  const [isSourceExpanded, setSourceExpanded] = useState(false);
  const [isReviewing, setReviewing] = useState(false);
  const wasOpen = useRef(false);

  const squid = { integratorId: readSquidIntegratorId(), fetch: squidFetch };
  const payingWallet =
    wallets.find((wallet) => wallet.address.toLowerCase() === payingAddress.toLowerCase()) ??
    pickDefaultWallet(wallets);
  const isEmbedded = payingWallet ? isPrivyEmbeddedWallet(payingWallet) : false;
  const scan = useUsdcBalancesAcrossChains({ enabled: open, owner: payingWallet?.address, squid });
  const defaultSource = pickDefaultUsdcSource(scan.sources);
  const sourceChoice: UsdcSourceChoice =
    chosenSource ??
    (defaultSource ? { chainId: defaultSource.chainId, token: defaultSource.token.token } : FALLBACK_SOURCE);
  const sourceChainId = sourceChoice.chainId;
  const cardChainId =
    chosenCardChainId ?? (CARD_ONRAMP_CHAIN_IDS.includes(sourceChainId) ? sourceChainId : BASE_CHAIN_ID);
  const cardChain = CARD_CHAINS.find((chain) => chain.id === cardChainId);
  const sourceChain = SQUID_SOURCE_CHAINS.find((chain) => chain.id === sourceChainId);
  const nativeSymbol = sourceChain?.nativeCurrency.symbol ?? "gas";
  const sourceClient = usePublicClient({ chainId: sourceChainId });
  const destinationClient = usePublicClient({ chainId: mainnet.id });

  const execution = useSquidDepositExecution({
    accountId,
    depositTarget: DEPOSIT_CONTRACTS,
    destinationClient,
    isEmbedded,
    onClosed: () => onOpenChange(false),
    open,
    recipient,
    requestReview,
    sourceClient,
    squid,
  });
  const {
    balances,
    balancesQuery,
    filGasTopUp,
    gasTopUpAmount,
    hasInsufficientGas,
    hasInsufficientUsdc,
    parsedAmount,
    quote,
    quoteQuery,
    rate,
    requiredNative,
    sourceToken,
    tokensQuery,
  } = useSquidDepositQuote({
    amount: debouncedAmount,
    depositTarget: DEPOSIT_CONTRACTS,
    isQuoting: !execution.isExecuting,
    open,
    payingWallet,
    recipient,
    sourceChainId,
    sourceClient,
    sourceTokenAddress: sourceChoice.token,
    squid,
  });
  const { pendingDeposit, stage } = execution;
  const isBusy = execution.isExecuting || isFunding;
  const canConfirm =
    !isBusy &&
    pendingDeposit === null &&
    !!quote &&
    !!payingWallet &&
    !!sourceToken &&
    !!sourceChain &&
    !!recipient &&
    parsedAmount !== null &&
    !!sourceClient &&
    !!destinationClient &&
    !hasInsufficientUsdc &&
    !hasInsufficientGas;

  // Only an open dialog claims top-up activity; a closed instance elsewhere on
  // the page must not clear it for the guided flow.
  useEffect(() => {
    if (open) setTopUpActive(true);
    else if (wasOpen.current) setTopUpActive(false);
    wasOpen.current = open;
    if (open) {
      setAmount("");
      setChosenCardChainId(null);
      setChosenSource(null);
      setReviewing(false);
      setSourceExpanded(false);
    }
  }, [open, setTopUpActive]);

  useEffect(
    () => () => {
      if (wasOpen.current) setTopUpActive(false);
    },
    [setTopUpActive],
  );

  const handleOpenChange = createDialogCloseGuard({
    blockReason: () => (isBusy ? "Wait for the current step to finish before closing this dialog." : null),
    onClose: execution.closeDialog,
    onOpen: () => onOpenChange(true),
  });

  const handleConfirm = () => {
    if (!canConfirm || !payingWallet || !sourceToken || !sourceChain || !recipient || parsedAmount === null || !quote) {
      return;
    }
    return execution.confirm({
      amount,
      filGasTopUp,
      parsedAmount,
      payingWallet,
      quote,
      recipient,
      sourceChain,
      sourceToken,
    });
  };

  const runFundingFlow = async (
    flow: () => Promise<unknown>,
    { successMessage, unavailableTitle }: { successMessage?: string; unavailableTitle: string },
  ) => {
    setIsFunding(true);
    try {
      if ((await runPrivyFunding(flow, { unavailableTitle })) && successMessage) toast.success(successMessage);
    } finally {
      setIsFunding(false);
      void balancesQuery.refetch();
      void scan.refetch();
    }
  };

  // The USDC a purchase lands as: native USDC on the chosen network, by Squid's listing or by address.
  const cardToken = findCardUsdcToken(scan.sources, cardChainId);

  /** Privy's card onramp (Stripe, MoonPay, or Meld by region) into the paying wallet. */
  const buyUsdcWithCard = () => {
    if (!payingWallet || !cardToken) return;
    return runFundingFlow(
      () =>
        fundWithCard(
          buildCardOnrampOptions({
            address: payingWallet.address,
            asset: cardToken.token,
            chainId: cardChainId,
            defaultAmount: parsedAmount === null ? undefined : amount,
            environment: readOnrampEnvironment(),
          }),
        ),
      { successMessage: "USDC is on its way to your Privy wallet", unavailableTitle: "Card purchases are unavailable" },
    );
  };

  /** Privy's unified funding modal: exchange or a transfer from another wallet. Needs a Privy login. */
  const transferUsdcToPrivyWallet = () => {
    if (!payingWallet || !cardToken) return;
    return runFundingFlow(
      () =>
        addFunds({
          destination: { address: payingWallet.address, chain: toCaipChainId(cardChainId), asset: cardToken.token },
          crypto: {},
        }),
      { successMessage: "USDC is on its way to your Privy wallet", unavailableTitle: "Privy funding is unavailable" },
    );
  };

  const addGasToPrivyWallet = () => {
    if (!payingWallet || !sourceChain) return;
    return runFundingFlow(
      () =>
        fundWallet({
          address: payingWallet.address,
          options: { chain: sourceChain, asset: "native-currency", amount: gasTopUpAmount },
        }),
      { unavailableTitle: "Privy funding is unavailable" },
    );
  };

  const explorerUrl = sourceChain?.blockExplorers?.default.url;
  const explorerName = sourceChain?.blockExplorers?.default.name;
  const activeStage = stage ?? (pendingDeposit ? "bridging" : null);
  const payerLabel = isEmbedded ? "your Privy wallet" : "this wallet";
  const isSourceResolved = !!payingWallet && !!sourceToken;
  const resolvedChoice = sourceToken ? { chainId: sourceChainId, token: sourceToken.token } : undefined;
  // Another network that would do: the one covering the amount, or holding the most USDC before an amount is typed.
  const betterSource = parsedAmount !== null ? findUsdcSourceCovering(scan.sources, debouncedAmount) : defaultSource;
  const alternative = betterSource && !isSameUsdcSource(betterSource, resolvedChoice) ? betterSource : undefined;
  const alternativeChain = alternative && SQUID_SOURCE_CHAINS.find((chain) => chain.id === alternative.chainId);
  const helper = pickFundingHelper({
    hasAlternative: !!alternative,
    hasBalances: balances !== undefined,
    hasInsufficientGas,
    holdsUsdcSomewhere: scan.sources.some((source) => source.balance > 0n),
    isScanning: scan.isPending,
    isSourceResolved,
    isUsdcShort: balances?.token === 0n || hasInsufficientUsdc,
  });
  const topUpMessage =
    helper === "empty"
      ? `${payerLabel[0].toUpperCase()}${payerLabel.slice(1)} holds no USDC on any supported network yet.`
      : `Not enough USDC in ${payerLabel} on any supported network.`;
  const view = stage ? "progress" : pendingDeposit ? "pending" : isReviewing ? "review" : "amount";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>{view === "review" ? "Review payment" : "Pay with USDC"}</DialogTitle>
          <DialogDescription>
            {view === "review" ? (
              "Check the details, then confirm in your wallet."
            ) : (
              <>
                Fund your account from another network where you hold USDC. It is swapped to USDFC via{" "}
                <ExternalTextLink href='https://app.squidrouter.com/'>Squid</ExternalTextLink> and deposited for you.
                Nothing to sign on Filecoin, no FIL needed.
              </>
            )}
            {recipient ? (
              <span className='mt-1 block font-mono text-xs'>Account {formatAddress(recipient)}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 text-sm'>
          {view === "pending" && pendingDeposit && (
            <PendingDepositPanel
              activeStage={activeStage}
              error={execution.error}
              explorerName={explorerName}
              explorerUrl={explorerUrl}
              hasApproved={execution.hasApproved}
              isBusy={isBusy}
              isEmbedded={isEmbedded}
              onCheckAgain={() => void execution.resumePendingDeposit(pendingDeposit)}
              onDismiss={execution.dismissPendingDeposit}
              pendingDeposit={pendingDeposit}
            />
          )}

          {view === "progress" && stage && (
            <DepositProgress
              explorerName={explorerName}
              explorerUrl={explorerUrl}
              hasApproved={execution.hasApproved}
              isEmbedded={isEmbedded}
              stage={stage}
              transactionHash={execution.transactionHash}
            />
          )}

          {view === "review" && quote && sourceToken && payingWallet && sourceChain && rate !== null && (
            <>
              <dl className='grid gap-2 rounded-md border p-3'>
                <div className='flex items-start justify-between gap-4'>
                  <dt className='text-muted-foreground'>Pay</dt>
                  <dd className='text-right font-medium'>
                    {amount} {sourceToken.symbol}
                    <span className='block text-xs font-normal text-muted-foreground'>
                      from {describeWallet(payingWallet)} on {sourceChain.name}
                    </span>
                  </dd>
                </div>
                <div className='flex items-start justify-between gap-4'>
                  <dt className='text-muted-foreground'>Deposit to</dt>
                  <dd className='text-right font-medium'>Your Filecoin Pay account</dd>
                </div>
              </dl>
              <QuoteSummary filGasTopUp={filGasTopUp} quote={quote} rate={rate} tokenSymbol={sourceToken.symbol} />
              <p className='text-muted-foreground'>
                {isEmbedded
                  ? "Your Privy wallet signs the approval and the swap for you."
                  : "Your wallet will ask you to approve USDC on a first purchase, then to confirm the swap."}
              </p>
            </>
          )}

          {view === "amount" && (
            <>
              <PaymentSourceFields
                areWalletsReady={areWalletsReady}
                isBusy={isBusy}
                isCollapsed={!isSourceExpanded}
                onConnectAnother={() => connectWallet()}
                onExpand={() => setSourceExpanded(true)}
                isScanning={scan.isPending}
                onPayingAddressChange={(address) => {
                  setPayingAddress(address);
                  setChosenSource(null);
                }}
                onSourceChange={setChosenSource}
                payingWallet={payingWallet}
                sourceChain={sourceChain}
                sourceChoice={resolvedChoice ?? sourceChoice}
                sources={scan.sources}
                sourceToken={sourceToken}
                tokensQuery={tokensQuery}
                wallets={wallets}
              />

              <div className='grid gap-2'>
                <div className='flex items-center justify-between gap-2'>
                  <Label htmlFor={amountInputId}>Amount ({sourceToken?.symbol ?? "USDC"})</Label>
                  {balances && balances.token > 0n && sourceToken && (
                    <Button
                      disabled={isBusy}
                      onClick={() => setAmount(formatUnits(balances.token, sourceToken.decimals))}
                      size='compact'
                      type='button'
                      variant='ghost'
                    >
                      Max ({formatTokenAmount(balances.token, sourceToken.decimals)} {sourceToken.symbol})
                    </Button>
                  )}
                </div>
                {/* The amount is what the user came to type, so it takes focus on open and stays
                    enabled while the token list loads; a disabled field could not be focused. */}
                <Input
                  autoFocus
                  disabled={isBusy}
                  id={amountInputId}
                  inputMode='decimal'
                  onChange={setAmount}
                  placeholder='0.00'
                  type='text'
                  value={amount}
                />
                {amount !== "" && parsedAmount === null && debouncedAmount === amount && (
                  <p className='text-destructive'>Enter an amount greater than zero.</p>
                )}
              </div>

              {helper === "elsewhere" && alternative && alternativeChain && (
                <div className='flex flex-wrap items-center justify-between gap-2 rounded-md border p-3'>
                  <span className='text-muted-foreground'>
                    {alternativeChain.name} holds {formatUsdcBalance(alternative)} {alternative.token.symbol}
                    {parsedAmount !== null ? ", enough for this amount." : "."}
                  </span>
                  <Button
                    aria-label={`Pay from ${alternativeChain.name}`}
                    disabled={isBusy}
                    onClick={() => setChosenSource({ chainId: alternative.chainId, token: alternative.token.token })}
                    size='compact'
                    type='button'
                    variant='tertiary'
                  >
                    Use {alternativeChain.name}
                  </Button>
                </div>
              )}
              {(helper === "empty" || helper === "insufficient") && cardChain && (
                <TopUpWalletPanel
                  chainId={cardChainId}
                  chains={CARD_CHAINS}
                  hasPrivyLogin={hasPrivyLogin}
                  isBusy={isBusy}
                  message={topUpMessage}
                  onBuyWithCard={() => void buyUsdcWithCard()}
                  onChainChange={setChosenCardChainId}
                  onLogin={login}
                  onTransfer={() => void transferUsdcToPrivyWallet()}
                  tone={helper === "insufficient" ? "destructive" : "muted"}
                />
              )}
              {helper === "gas" && sourceChain && requiredNative !== null && (
                <GasShortfallPanel
                  gasTopUpAmount={gasTopUpAmount}
                  hasPrivyLogin={hasPrivyLogin}
                  isBusy={isBusy}
                  nativeSymbol={nativeSymbol}
                  networkName={sourceChain.name}
                  onAddGas={() => void addGasToPrivyWallet()}
                  onLogin={login}
                  requiredNative={requiredNative}
                />
              )}

              {quoteQuery.isFetching && !quote && (
                <p className='inline-flex items-center gap-2 text-muted-foreground'>
                  <Loader2 className='h-4 w-4 animate-spin' /> Fetching a quote…
                </p>
              )}
              {quoteQuery.error && (
                <p className='text-destructive' role='alert'>
                  {quoteQuery.error instanceof Error ? quoteQuery.error.message : "Squid could not quote this amount."}
                </p>
              )}
              {quote && sourceToken && rate !== null && (
                <p className='flex items-center justify-between gap-2 text-muted-foreground'>
                  <span>You receive at least</span>
                  <span className='font-medium text-foreground'>
                    {formatUsdfcAmount(getDepositAfterFilGasTopUp(quote.minimumDestinationAmount, filGasTopUp))} USDFC
                  </span>
                </p>
              )}
            </>
          )}

          {execution.error && view !== "pending" && (
            <p className='text-destructive' role='alert'>
              {execution.error}
            </p>
          )}
        </div>

        <DialogFooter>
          {view === "review" ? (
            <Button disabled={isBusy} onClick={() => setReviewing(false)} type='button' variant='ghost'>
              Back
            </Button>
          ) : (
            <Button disabled={isBusy} onClick={() => handleOpenChange(false)} type='button' variant='ghost'>
              {view === "pending" ? "Close" : "Cancel"}
            </Button>
          )}
          {view === "amount" && (
            <Button
              aria-label='Review payment'
              className='disabled:cursor-not-allowed disabled:opacity-50'
              disabled={!canConfirm}
              onClick={() => setReviewing(true)}
              type='button'
              variant='primary'
            >
              Review
            </Button>
          )}
          {view === "review" && sourceToken && (
            <Button
              aria-label='Pay with USDC'
              className='disabled:cursor-not-allowed disabled:opacity-50'
              disabled={!canConfirm}
              onClick={() => void handleConfirm()}
              type='button'
              variant='primary'
            >
              Pay {amount} {sourceToken.symbol}
            </Button>
          )}
        </DialogFooter>
        {reviewDialog}
      </DialogContent>
    </Dialog>
  );
}
