import type { SourceToken } from "@filecoin-project/squid-evm-funding";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { type Address, createWalletClient, custom, getAddress, type Hash } from "viem";
import type { useTransactionReview } from "@/components/UserConsole/TransactionReview";
import { mainnet, type SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { formatUsdfcAmount } from "../../data/funding-runway";
import { invalidateTopUpQueries } from "../../data/guided-top-up";
import {
  awaitSquidDepositSettlement,
  executeSquidDeposit,
  type SquidDepositDestinationClient,
  SquidDepositError,
  type SquidDepositResult,
  type SquidDepositSourceClient,
  type SquidDepositStage,
} from "../../data/squid-deposit-execution";
import {
  isExecutableQuote,
  requestSquidDepositRoute,
  type SquidClient,
  type SquidDepositQuote,
  type SquidDepositRouteRequest,
} from "../../data/squid-deposit-route";
import {
  clearPendingSquidDeposit,
  loadPendingSquidDeposit,
  type PendingSquidDeposit,
  savePendingSquidDeposit,
} from "../../data/squid-deposit-tracker";
import { walletErrorMessage } from "../../data/squid-execution";
import type { UiStage } from "./stages";
import type { DepositContracts } from "./useSquidDepositQuote";

export type SourceChain = (typeof SQUID_SOURCE_CHAINS)[number];

export interface ConfirmDepositInput {
  /** The amount as typed, for the review title. */
  amount: string;
  parsedAmount: bigint;
  payingWallet: ConnectedWallet;
  quote: SquidDepositQuote;
  recipient: Address;
  sourceChain: SourceChain;
  sourceToken: SourceToken;
}

/**
 * Runs and tracks a USDC deposit: the review, the source-network signatures,
 * the pending record that survives a reload, resume, failure and dismissal.
 * The dialog owns what the user is choosing; this owns what is happening.
 */
export function useSquidDepositExecution({
  accountId,
  depositTarget,
  destinationClient,
  isEmbedded,
  onClosed,
  open,
  recipient,
  requestReview,
  sourceClient,
  squid,
}: {
  accountId: string;
  depositTarget: DepositContracts;
  destinationClient: SquidDepositDestinationClient | undefined;
  isEmbedded: boolean;
  /** Called once the dialog may close, after the embedded wallet is back on Filecoin. */
  onClosed: () => void;
  open: boolean;
  recipient: Address | undefined;
  requestReview: ReturnType<typeof useTransactionReview>["requestReview"];
  sourceClient: SquidDepositSourceClient | undefined;
  squid: SquidClient;
}) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<UiStage | null>(null);
  // Whether this run signed a USDC approval, so the swap signature reads as step 2 of 2.
  const [hasApproved, setHasApproved] = useState(false);
  const [transactionHash, setTransactionHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeposit, setPendingDeposit] = useState<PendingSquidDeposit | null>(null);
  const switchedEmbeddedWallet = useRef<ConnectedWallet | null>(null);
  const resumedHash = useRef<Hash | null>(null);
  const isExecuting = stage !== null;

  // Each opening starts clean and picks up any deposit still in flight for this account.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setStage(null);
    setTransactionHash(null);
    resumedHash.current = null;
    try {
      setPendingDeposit(recipient ? loadPendingSquidDeposit(window.localStorage, recipient) : null);
    } catch {
      // Storage can be unavailable (private mode, blocked site data); then there is nothing to resume.
      setPendingDeposit(null);
    }
  }, [open, recipient]);

  const setStageWithHash = (nextStage: SquidDepositStage, hash?: Hash) => {
    if (nextStage === "approving") setHasApproved(true);
    setStage(nextStage);
    if (hash) setTransactionHash(hash);
  };

  const restoreEmbeddedChain = () => {
    const wallet = switchedEmbeddedWallet.current;
    switchedEmbeddedWallet.current = null;
    if (!wallet) return;
    void wallet.switchChain(mainnet.id).catch((switchError: unknown) => {
      toast.error("Could not switch your Privy wallet back to Filecoin", {
        description: walletErrorMessage(switchError, "Switch networks from the wallet menu."),
      });
    });
  };

  const closeDialog = () => {
    restoreEmbeddedChain();
    onClosed();
  };

  const finishDeposit = async (result: SquidDepositResult, depositRecipient: Address) => {
    try {
      clearPendingSquidDeposit(window.localStorage, depositRecipient);
    } catch {
      // Storage is best effort; the deposit itself is confirmed on-chain.
    }
    setPendingDeposit(null);
    setStage(null);
    toast.success(`Deposited ${formatUsdfcAmount(result.depositedAmount)} USDFC into Filecoin Pay`);
    await invalidateTopUpQueries(queryClient, accountId, depositRecipient);
    closeDialog();
  };

  const handleFailure = (failure: unknown, depositRecipient: Address | undefined) => {
    setStage(null);
    if (failure instanceof SquidDepositError) {
      setError(failure.message);
      if (failure.reason !== "timeout" && depositRecipient) {
        // Nothing is left to resume: the route failed or delivered to the wallet.
        try {
          clearPendingSquidDeposit(window.localStorage, depositRecipient);
        } catch {
          // Storage is best effort.
        }
        setPendingDeposit(null);
      }
      return;
    }
    setError(walletErrorMessage(failure, "The USDC funding could not be completed."));
  };

  const resumePendingDeposit = async (deposit: PendingSquidDeposit) => {
    if (!destinationClient) return;
    setError(null);
    setTransactionHash(deposit.transactionHash);
    try {
      const result = await awaitSquidDepositSettlement({
        destinationClient,
        fundsBefore: deposit.fundsBefore,
        onStage: setStageWithHash,
        quoteId: deposit.quoteId,
        sourceChainId: deposit.sourceChainId,
        squid,
        target: { ...depositTarget, recipient: deposit.recipient },
        transactionHash: deposit.transactionHash,
      });
      await finishDeposit(result, deposit.recipient);
    } catch (failure) {
      handleFailure(failure, deposit.recipient);
    }
  };

  // Reads the latest handlers without making the effect below depend on them.
  const resumeOnOpen = useEffectEvent((deposit: PendingSquidDeposit) => {
    if (isExecuting || resumedHash.current === deposit.transactionHash) return;
    resumedHash.current = deposit.transactionHash;
    void resumePendingDeposit(deposit);
  });

  useEffect(() => {
    if (open && pendingDeposit) resumeOnOpen(pendingDeposit);
  }, [open, pendingDeposit]);

  /** Stops following the deposit; the panel asks the user to confirm first. */
  const dismissPendingDeposit = () => {
    if (!pendingDeposit) return;
    try {
      clearPendingSquidDeposit(window.localStorage, pendingDeposit.recipient);
    } catch {
      // Storage is best effort.
    }
    setPendingDeposit(null);
    setError(null);
    setTransactionHash(null);
  };

  const confirm = async ({
    amount,
    parsedAmount,
    payingWallet,
    quote,
    recipient: to,
    sourceChain,
    sourceToken,
  }: ConfirmDepositInput) => {
    if (isExecuting || !sourceClient || !destinationClient) return;
    setError(null);
    const owner = getAddress(payingWallet.address);
    const request: SquidDepositRouteRequest = {
      ...depositTarget,
      owner,
      recipient: to,
      sourceChainId: sourceChain.id,
      sourceToken: sourceToken.token,
      sourceAmount: parsedAmount,
    };
    if (isEmbedded) {
      const confirmed = await requestReview({
        title: `Fund with ${amount} ${sourceToken.symbol}`,
        rows: [
          { label: "Pay from", value: owner },
          { label: "Network", value: sourceChain.name },
          { label: "Receive at least", value: `${formatUsdfcAmount(quote.minimumDestinationAmount)} USDFC` },
          { label: "Deposit to", value: `Filecoin Pay account ${to}` },
        ],
        details: JSON.stringify(
          { quoteId: quote.quoteId, router: "Squid", sourceToken: sourceToken.token, to },
          null,
          2,
        ),
      });
      if (!confirmed) return;
    }

    setHasApproved(false);
    setStage("preparing");
    try {
      await payingWallet.switchChain(sourceChain.id);
      if (isEmbedded) switchedEmbeddedWallet.current = payingWallet;
      const provider = await payingWallet.getEthereumProvider();
      const walletClient = createWalletClient({ account: owner, chain: sourceChain, transport: custom(provider) });
      const executable = await requestSquidDepositRoute(request, squid, { quoteOnly: false });
      if (!isExecutableQuote(executable)) throw new Error("Squid did not return an executable route");
      if (executable.minimumDestinationAmount < (quote.minimumDestinationAmount * 99n) / 100n) {
        throw new Error("The executable quote fell more than 1% below the reviewed amount. Refresh and try again.");
      }
      const result = await executeSquidDeposit({
        destinationClient,
        onBroadcast: ({ transactionHash: hash, fundsBefore }) => {
          const broadcastDeposit: PendingSquidDeposit = {
            recipient: to,
            owner,
            sourceChainId: sourceChain.id,
            quoteId: executable.quoteId,
            transactionHash: hash,
            sourceAmount: parsedAmount,
            sourceSymbol: sourceToken.symbol,
            sourceDecimals: sourceToken.decimals,
            minimumDestinationAmount: executable.minimumDestinationAmount,
            fundsBefore,
            startedAt: Date.now(),
          };
          resumedHash.current = hash;
          try {
            setPendingDeposit(savePendingSquidDeposit(window.localStorage, broadcastDeposit));
          } catch {
            // Storage is best effort; the deposit is still tracked in memory for this session.
            setPendingDeposit(broadcastDeposit);
          }
        },
        onStage: setStageWithHash,
        quote: executable,
        request,
        sourceClient,
        squid,
        walletClient,
      });
      await finishDeposit(result, to);
    } catch (failure) {
      handleFailure(failure, to);
    }
  };

  return {
    closeDialog,
    confirm,
    dismissPendingDeposit,
    error,
    hasApproved,
    isExecuting,
    pendingDeposit,
    resumePendingDeposit,
    stage,
    transactionHash,
  };
}
