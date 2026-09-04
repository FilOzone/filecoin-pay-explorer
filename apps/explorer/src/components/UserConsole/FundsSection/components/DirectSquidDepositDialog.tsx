"use client";

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
import { SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { useWallets } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type Address,
  createWalletClient,
  custom,
  erc20Abi,
  formatUnits,
  getAddress,
  type Hash,
  parseUnits,
} from "viem";
import { estimateTotalFee } from "viem/op-stack";
import { useAccount, usePublicClient } from "wagmi";
import { getAccount } from "wagmi/actions";
import { mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { config } from "@/services/wagmi/config";
import { formatAddress } from "@/utils/formatter";
import { useTopUpActivity } from "../../TopUpActivityContext";
import { filecoinGasBalanceStatus } from "../data/filecoin-gas-balance";
import { invalidateTopUpQueries } from "../data/guided-top-up";
import {
  orderSourceTokensByBalance,
  readSourceTokenBalance,
  readSourceTokenBalances,
  sourceTokenBalance,
  sourceTokenBalancesQueryKey,
  sourceTokenCatalogIdentity,
} from "../data/source-token-balances";
import { withSquidAcquisitionLock } from "../data/squid-acquisition-lock";
import {
  awaitSquidDepositSettlement,
  executeSquidDeposit,
  type SquidDepositDestinationClient,
  SquidDepositError,
  type SquidDepositSourceClient,
  type SquidDepositStage,
} from "../data/squid-deposit-execution";
import {
  assertExecutableQuoteWithinReview,
  captureReviewedSquidDepositCaps,
  FIL_GAS_TOP_UP_AMOUNT,
  getDepositNetworkFeeMaximum,
  getDepositRequiredNativeBalance,
  isExecutableQuote,
  isNativeToken,
  planFilGasTopUp,
  requestSquidDepositRoute,
  type SquidDepositQuote,
  type SquidDepositRouteRequest,
} from "../data/squid-deposit-route";
import {
  assertSquidDepositContext,
  claimSquidDepositSubmission,
  releaseSquidDepositSubmission,
  type SquidDepositContextSnapshot,
} from "../data/squid-deposit-submit";
import {
  clearPendingSquidDeposit,
  hasPendingSquidDeposit,
  loadPendingSquidDeposit,
  type PendingSquidDeposit,
  savePendingSquidDeposit,
  subscribeToPendingSquidDeposit,
} from "../data/squid-deposit-tracker";
import { isOpStackChain, isUserRejectedRequest, walletErrorMessage } from "../data/squid-execution";
import { paymentTokensQueryOptions } from "../data/squid-payment-tokens";
import { squidFetch } from "../data/squid-quote";
import { type SearchableOption, SearchableSelect } from "./SearchableSelect";

const DEFAULT_SOURCE_CHAIN = 8453;
const DEPOSIT_TARGET = {
  payments: mainnet.contracts.payments.address,
  usdfc: mainnet.contracts.usdfc.address,
};

type ReviewedDeposit = {
  approvalRequired: boolean;
  approvalResetRequired: boolean;
  amount: string;
  context: SquidDepositContextSnapshot;
  maxNativeFee: bigint;
  quote: SquidDepositQuote;
  requiredNative: bigint;
  sourceDecimals: number;
  sourceSymbol: string;
};

export function DirectSquidDepositDialog({
  accountId,
  onOpenChange,
  open,
}: {
  accountId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { address: connectedRecipient } = useAccount();
  const { wallets } = useWallets();
  const { setTopUpActive } = useTopUpActivity();
  const queryClient = useQueryClient();
  const [payingAddress, setPayingAddress] = useState("");
  const [sourceChainId, setSourceChainId] = useState(DEFAULT_SOURCE_CHAIN);
  const [sourceTokenAddress, setSourceTokenAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [includeFilGas, setIncludeFilGas] = useState(true);
  const [reviewed, setReviewed] = useState<ReviewedDeposit | null>(null);
  const [stage, setStage] = useState<SquidDepositStage | "preparing" | null>(null);
  const [transactionHash, setTransactionHash] = useState<Hash | null>(null);
  const [pending, setPending] = useState<PendingSquidDeposit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const initializedSelectionScope = useRef("");
  const initializedFilGasScope = useRef("");
  const switchedToSource = useRef(false);
  const latestContext = useRef<{
    open: boolean;
    recipient?: string;
    owner?: string;
    chainId: number;
    token?: string;
    amount?: bigint;
  }>({ open, recipient: connectedRecipient, chainId: sourceChainId });

  const recipient = connectedRecipient ? getAddress(connectedRecipient) : undefined;
  const payingWallet =
    wallets.find((wallet) => wallet.address.toLowerCase() === payingAddress.toLowerCase()) ??
    wallets.find((wallet) => wallet.address.toLowerCase() === recipient?.toLowerCase()) ??
    wallets[0];
  const sourceChain = SQUID_SOURCE_CHAINS.find((chain) => chain.id === sourceChainId);
  const sourceClient = usePublicClient({ chainId: sourceChainId });
  const destinationClient = usePublicClient({ chainId: mainnet.id });
  const squid = useMemo(
    () => ({
      fetch: squidFetch,
      integratorId:
        process.env.NEXT_PUBLIC_SQUID_INTEGRATOR_ID?.trim() || "filecoin-testing-94a4a25a-d40b-41cb-b148-e96098862",
    }),
    [],
  );
  const tokensQuery = useQuery({ ...paymentTokensQueryOptions(sourceChainId, squid), enabled: open });
  const tokens = tokensQuery.data ?? [];
  const owner = payingWallet ? getAddress(payingWallet.address) : undefined;
  const inventoryBalancesQuery = useQuery({
    enabled: open && !!owner && tokens.length > 0 && !!sourceClient,
    queryFn: () => {
      if (!owner || !sourceClient) throw new Error("Source balances are unavailable");
      return readSourceTokenBalances(sourceClient, owner, tokens);
    },
    queryKey: owner
      ? sourceTokenBalancesQueryKey(owner, sourceChainId, tokens)
      : ["squid", "source-token-balances", "", sourceChainId, sourceTokenCatalogIdentity(tokens)],
    refetchInterval: 30_000,
    retry: 1,
  });
  const inventoryBalances = inventoryBalancesQuery.isError ? undefined : inventoryBalancesQuery.data;
  const orderedTokens = useMemo(
    () => orderSourceTokensByBalance(tokens, inventoryBalances ?? {}),
    [inventoryBalances, tokens],
  );
  const sourceToken = tokens.find((token) => token.token.toLowerCase() === sourceTokenAddress.toLowerCase());
  const sourceIsNative = sourceToken ? isNativeToken(sourceToken.token) : false;
  const duplicateSymbols = useMemo(() => {
    const counts = new Map<string, number>();
    for (const token of tokens)
      counts.set(token.symbol.toLowerCase(), (counts.get(token.symbol.toLowerCase()) ?? 0) + 1);
    return counts;
  }, [tokens]);
  const tokenOptions = useMemo<readonly SearchableOption[]>(
    () =>
      orderedTokens.map((token) => {
        const balance = sourceTokenBalance(inventoryBalances, token.token);
        const duplicate = (duplicateSymbols.get(token.symbol.toLowerCase()) ?? 0) > 1;
        return {
          aliases: [token.symbol, token.token],
          detail: balance == null ? "Balance unavailable" : `${formatUnits(balance, token.decimals)} ${token.symbol}`,
          label: duplicate ? `${token.symbol} (${formatAddress(token.token)})` : token.symbol,
          secondaryLabel: duplicate ? undefined : formatAddress(token.token),
          value: token.token,
        };
      }),
    [duplicateSymbols, inventoryBalances, orderedTokens],
  );
  const parsedAmount = (() => {
    if (!sourceToken || amount.trim() === "") return null;
    try {
      const value = parseUnits(amount, sourceToken.decimals);
      return value > 0n ? value : null;
    } catch {
      return null;
    }
  })();
  const balancesQuery = useQuery({
    enabled: open && !!payingWallet && !!sourceToken && !!sourceClient,
    queryFn: async () => {
      if (!payingWallet || !sourceToken || !sourceClient) throw new Error("Source balances are unavailable");
      const owner = getAddress(payingWallet.address);
      const nativePromise = sourceClient.getBalance({ address: owner });
      const [token, native, allowance] = await Promise.all([
        sourceIsNative ? nativePromise : readSourceTokenBalance(sourceClient, owner, sourceToken),
        nativePromise,
        sourceIsNative
          ? Promise.resolve(0n)
          : sourceClient.readContract({
              abi: erc20Abi,
              address: sourceToken.token,
              args: [owner, SQUID_ROUTER_ADDRESS],
              functionName: "allowance",
            }),
      ]);
      return { allowance, native, token };
    },
    queryKey: ["direct-squid-deposit-balances", sourceChainId, sourceToken?.token, owner],
    refetchInterval: 15_000,
  });
  const recipientFilQuery = useQuery({
    enabled: open && !!recipient && !!destinationClient,
    queryFn: () => {
      if (!recipient || !destinationClient) throw new Error("Filecoin balance is unavailable");
      return destinationClient.getBalance({ address: recipient });
    },
    queryKey: ["direct-squid-destination-fil", recipient],
    refetchInterval: 30_000,
    refetchOnMount: "always",
    retry: 1,
  });
  const recipientFilStatus = filecoinGasBalanceStatus(
    recipientFilQuery.data,
    recipientFilQuery.isFetching,
    recipientFilQuery.isError,
    FIL_GAS_TOP_UP_AMOUNT,
  );
  const quoteQuery = useQuery({
    enabled:
      open &&
      !reviewed &&
      !!recipient &&
      !!payingWallet &&
      !!sourceToken &&
      parsedAmount !== null &&
      !recipientFilQuery.isFetching &&
      !balancesQuery.isError &&
      (balancesQuery.data?.token ?? 0n) >= parsedAmount,
    queryFn: async () => {
      if (!recipient || !payingWallet || !sourceToken || parsedAmount === null) throw new Error("Quote unavailable");
      const request = {
        ...DEPOSIT_TARGET,
        owner: getAddress(payingWallet.address),
        recipient,
        sourceAmount: parsedAmount,
        sourceChainId,
        sourceToken: sourceToken.token,
      };
      const quote = await requestSquidDepositRoute(request, squid, { quoteOnly: true });
      if (!includeFilGas) return quote;
      const filGasTopUp = planFilGasTopUp(quote, Date.now);
      if (!filGasTopUp) {
        throw new Error(
          "Squid could not safely add 0.25 FIL for this amount. Increase the amount or turn off the FIL option.",
        );
      }
      return requestSquidDepositRoute({ ...request, filGasTopUp }, squid, { quoteOnly: true });
    },
    queryKey: [
      "direct-squid-deposit-quote",
      recipient,
      payingWallet?.address,
      sourceChainId,
      sourceToken?.token,
      parsedAmount?.toString(),
      includeFilGas,
    ],
    retry: false,
  });

  latestContext.current = {
    open,
    recipient,
    owner: payingWallet?.address,
    chainId: sourceChainId,
    token: sourceToken?.token,
    amount: parsedAmount ?? undefined,
  };

  useEffect(() => {
    if (!open) {
      initializedFilGasScope.current = "";
      return;
    }
    if (!recipient || recipientFilStatus === "loading") return;
    if (initializedFilGasScope.current === recipient) return;
    initializedFilGasScope.current = recipient;
    setIncludeFilGas(recipientFilStatus !== "funded");
  }, [open, recipient, recipientFilStatus]);

  useEffect(() => {
    if (!open || !owner || pending || tokens.length === 0 || inventoryBalancesQuery.isPending) return;
    const scope = `${owner}:${sourceChainId}:${sourceTokenCatalogIdentity(tokens)}`;
    if (initializedSelectionScope.current === scope) return;
    initializedSelectionScope.current = scope;
    if (!tokens.some((token) => token.token.toLowerCase() === sourceTokenAddress.toLowerCase())) {
      setSourceTokenAddress(orderedTokens[0]?.token ?? "");
    }
  }, [
    inventoryBalancesQuery.isPending,
    open,
    orderedTokens,
    owner,
    pending,
    sourceChainId,
    sourceTokenAddress,
    tokens,
  ]);

  useEffect(() => {
    if (!reviewed) return;
    const context = reviewed.context;
    if (
      !recipient ||
      !owner ||
      !sourceToken ||
      parsedAmount === null ||
      context.recipient.toLowerCase() !== recipient.toLowerCase() ||
      context.owner.toLowerCase() !== owner.toLowerCase() ||
      context.sourceChainId !== sourceChainId ||
      context.sourceToken.toLowerCase() !== sourceToken.token.toLowerCase() ||
      context.sourceAmount !== parsedAmount
    ) {
      setReviewed(null);
    }
  }, [owner, parsedAmount, recipient, reviewed, sourceChainId, sourceToken]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (open) setTopUpActive(true);
    return () => {
      if (open) setTopUpActive(false);
    };
  }, [open, setTopUpActive]);

  useEffect(() => {
    if (!open || !recipient) return;
    const refresh = () => {
      const saved = wallets
        .map((wallet) => {
          try {
            return loadPendingSquidDeposit(window.localStorage, getAddress(wallet.address), recipient);
          } catch {
            return null;
          }
        })
        .find((value): value is PendingSquidDeposit => value !== null);
      setPending(saved ?? null);
      if (saved) {
        setReviewed(null);
        setPayingAddress(saved.owner);
        setSourceChainId(saved.sourceChainId);
        setSourceTokenAddress(saved.sourceToken);
      }
    };
    setError(null);
    setReviewed(null);
    refresh();
    const unsubscribes = wallets.map((wallet) => subscribeToPendingSquidDeposit(getAddress(wallet.address), refresh));
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [open, recipient, wallets]);

  const assertContext = (snapshot: SquidDepositContextSnapshot) =>
    assertSquidDepositContext(latestContext.current, snapshot, getAccount(config).address, mounted.current);

  const clearSaved = (owner: Address) => {
    try {
      clearPendingSquidDeposit(window.localStorage, owner);
    } catch {
      // The on-chain result remains authoritative when storage is unavailable.
    }
    setPending(null);
  };

  const restoreFilecoin = async () => {
    if (!switchedToSource.current) return true;
    if (!payingWallet) {
      setError("Reconnect the paying wallet to return to Filecoin mainnet.");
      return false;
    }
    try {
      await payingWallet.switchChain(mainnet.id);
      switchedToSource.current = false;
      return true;
    } catch (failure) {
      setError(walletErrorMessage(failure, "Return to Filecoin mainnet before closing."));
      return false;
    }
  };

  const close = async () => {
    if (submitting.current || !(await restoreFilecoin())) return;
    onOpenChange(false);
  };

  const finish = async (owner: Address, depositRecipient: Address, depositedAmount: bigint) => {
    clearSaved(owner);
    setStage(null);
    setTransactionHash(null);
    toast.success(`Deposited ${formatUnits(depositedAmount, 18)} USDFC into Filecoin Pay`);
    await invalidateTopUpQueries(queryClient, accountId, depositRecipient);
    if (await restoreFilecoin()) onOpenChange(false);
  };

  const fail = (failure: unknown, owner?: Address) => {
    setStage(null);
    if (failure instanceof SquidDepositError) {
      setError(failure.message);
      if (failure.reason !== "timeout" && failure.reason !== "needs-gas" && owner) clearSaved(owner);
    } else {
      if (owner && isUserRejectedRequest(failure)) clearSaved(owner);
      setError(walletErrorMessage(failure, "The Squid deposit could not be completed."));
    }
  };

  const resume = async () => {
    if (!pending || !recipient || !destinationClient || !claimSquidDepositSubmission(submitting)) return;
    const pendingHash = pending.transactionHash;
    if (!pendingHash) {
      setError("The wallet may have submitted this route. Check its activity before dismissing and trying again.");
      releaseSquidDepositSubmission(submitting);
      return;
    }
    const walletStillConnected = wallets.some((wallet) => wallet.address.toLowerCase() === pending.owner.toLowerCase());
    if (!walletStillConnected || recipient.toLowerCase() !== pending.recipient.toLowerCase()) {
      setError("Reconnect the original paying wallet and Filecoin Pay account before resuming.");
      releaseSquidDepositSubmission(submitting);
      return;
    }
    setError(null);
    try {
      await withSquidAcquisitionLock(globalThis.navigator?.locks, pending.owner, async () => {
        const result = await awaitSquidDepositSettlement({
          destinationClient: destinationClient as SquidDepositDestinationClient,
          fundsBefore: pending.fundsBefore,
          minimumDestinationAmount: pending.minimumDestinationAmount,
          onStage: (next, hash) => {
            setStage(next);
            if (hash) setTransactionHash(hash);
          },
          quoteId: pending.quoteId,
          sourceChainId: pending.sourceChainId,
          squid,
          target: { ...DEPOSIT_TARGET, recipient: pending.recipient },
          transactionHash: pendingHash,
        });
        await finish(pending.owner, pending.recipient, result.depositedAmount);
      });
    } catch (failure) {
      fail(failure, pending.owner);
    } finally {
      releaseSquidDepositSubmission(submitting);
    }
  };

  const confirm = async () => {
    if (!claimSquidDepositSubmission(submitting)) return;
    setError(null);
    try {
      if (!payingWallet || !sourceChain || !sourceClient || !destinationClient || !reviewed) {
        throw new Error("Review a current Squid quote before confirming.");
      }
      const snapshot = reviewed.context;
      assertContext(snapshot);
      const request: SquidDepositRouteRequest = {
        ...DEPOSIT_TARGET,
        ...snapshot,
        ...(reviewed.quote.filGasTopUp ? { filGasTopUp: reviewed.quote.filGasTopUp } : {}),
      };
      const reviewedCaps = captureReviewedSquidDepositCaps(reviewed.quote, snapshot.sourceToken);

      await withSquidAcquisitionLock(globalThis.navigator?.locks, snapshot.owner, async () => {
        if (hasPendingSquidDeposit(window.localStorage, snapshot.owner)) {
          throw new Error("A Squid deposit from this wallet is already pending.");
        }
        assertContext(snapshot);
        setStage("preparing");
        await payingWallet.switchChain(snapshot.sourceChainId);
        switchedToSource.current = snapshot.sourceChainId !== mainnet.id;
        assertContext(snapshot);
        const provider = await payingWallet.getEthereumProvider();
        const walletClient = createWalletClient({
          account: snapshot.owner,
          chain: sourceChain,
          transport: custom(provider),
        });
        const executable = await requestSquidDepositRoute(request, squid, { quoteOnly: false });
        if (!isExecutableQuote(executable)) throw new Error("Squid did not return an executable route");
        assertExecutableQuoteWithinReview(executable, reviewedCaps);
        const executionSourceClient = isOpStackChain(snapshot.sourceChainId)
          ? {
              ...sourceClient,
              estimateTotalFee: (feeRequest: Parameters<typeof estimateTotalFee>[1]) =>
                estimateTotalFee(sourceClient, feeRequest),
            }
          : sourceClient;
        let saved: PendingSquidDeposit | null = null;
        const save = (next: PendingSquidDeposit) => {
          saved = savePendingSquidDeposit(window.localStorage, next);
          setPending(saved);
        };
        const result = await executeSquidDeposit({
          approvalRequired: reviewed.approvalRequired,
          approvalResetRequired: reviewed.approvalResetRequired,
          assertCurrentContext: () => assertContext(snapshot),
          destinationClient: destinationClient as SquidDepositDestinationClient,
          getCurrentOwner: async () => {
            const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
            return accounts[0] ? getAddress(accounts[0]) : undefined;
          },
          maxNativeFee: reviewed.maxNativeFee,
          onSwapAttempt: (fundsBefore) => {
            save({
              executionStage: "swap-requested",
              fundsBefore,
              minimumDestinationAmount: executable.minimumDestinationAmount,
              owner: snapshot.owner,
              quoteId: executable.quoteId,
              recipient: snapshot.recipient,
              sourceAmount: snapshot.sourceAmount,
              sourceChainId: snapshot.sourceChainId,
              sourceDecimals: reviewed.sourceDecimals,
              sourceSymbol: reviewed.sourceSymbol,
              sourceToken: snapshot.sourceToken,
              startedAt: Date.now(),
            });
          },
          onBroadcast: ({ fundsBefore, transactionHash: hash }) => {
            save({
              executionStage: "swap-broadcast",
              fundsBefore,
              minimumDestinationAmount: executable.minimumDestinationAmount,
              owner: snapshot.owner,
              quoteId: executable.quoteId,
              recipient: snapshot.recipient,
              sourceAmount: snapshot.sourceAmount,
              sourceChainId: snapshot.sourceChainId,
              sourceDecimals: reviewed.sourceDecimals,
              sourceSymbol: reviewed.sourceSymbol,
              sourceToken: snapshot.sourceToken,
              startedAt: saved?.startedAt ?? Date.now(),
              transactionHash: hash,
            });
            setTransactionHash(hash);
          },
          onStage: (next, hash) => {
            setStage(next);
            if (hash) setTransactionHash(hash);
          },
          quote: executable,
          request,
          sourceClient: executionSourceClient as SquidDepositSourceClient,
          squid,
          walletClient,
        });
        await finish(snapshot.owner, snapshot.recipient, result.depositedAmount);
      });
    } catch (failure) {
      fail(failure, reviewed?.context.owner ?? (payingWallet ? getAddress(payingWallet.address) : undefined));
    } finally {
      releaseSquidDepositSubmission(submitting);
    }
  };

  const quote = quoteQuery.data;
  const networkFeeMaximum =
    quote && balancesQuery.data && sourceToken
      ? getDepositNetworkFeeMaximum(quote, sourceChainId, sourceToken.token, balancesQuery.data.allowance)
      : null;
  const requiredNative =
    quote && sourceToken && networkFeeMaximum !== null
      ? getDepositRequiredNativeBalance(quote, sourceChainId, sourceToken.token, networkFeeMaximum)
      : null;
  const canReview =
    !!quote &&
    parsedAmount !== null &&
    !balancesQuery.isError &&
    !!balancesQuery.data &&
    balancesQuery.data.token >= parsedAmount &&
    requiredNative !== null &&
    balancesQuery.data.native >= requiredNative;
  const busy = stage !== null;
  const explorerUrl = sourceChain?.blockExplorers?.default.url;
  const reviewedSourceChain = reviewed
    ? SQUID_SOURCE_CHAINS.find((chain) => chain.id === reviewed.context.sourceChainId)
    : undefined;

  return (
    <Dialog
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else void close();
      }}
      open={open}
    >
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>{reviewed ? "Review Squid deposit" : "Pay with another token"}</DialogTitle>
          <DialogDescription>
            Squid swaps your selected token to USDFC and deposits it directly into Filecoin Pay. Squid covers the
            Filecoin destination transaction, so no Filecoin wallet signature is required.
            {recipient ? (
              <span className='mt-1 block font-mono text-xs'>Pay account {formatAddress(recipient)}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 text-sm'>
          {pending ? (
            <section className='grid gap-3 rounded-md border p-3' aria-label='Pending Squid deposit'>
              <p>
                {stage
                  ? `Deposit status: ${stage}`
                  : pending.transactionHash
                    ? "A Squid deposit is still in progress."
                    : "Your wallet may have submitted this route. Check its activity before trying again."}
              </p>
              {pending.transactionHash ? (
                <div className='flex flex-wrap gap-3'>
                  {explorerUrl ? (
                    <a
                      className='underline'
                      href={`${explorerUrl}/tx/${pending.transactionHash}`}
                      target='_blank'
                      rel='noreferrer'
                    >
                      Source transaction
                    </a>
                  ) : null}
                  <a
                    className='underline'
                    href={`https://axelarscan.io/gmp/${pending.transactionHash}`}
                    target='_blank'
                    rel='noreferrer'
                  >
                    Squid route / add gas
                  </a>
                </div>
              ) : null}
              <div className='flex gap-2'>
                {pending.transactionHash ? (
                  <Button disabled={busy} onClick={() => void resume()} type='button' variant='primary'>
                    Check again
                  </Button>
                ) : null}
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm("Stop tracking this deposit in this browser? The transaction cannot be cancelled.")
                    )
                      clearSaved(pending.owner);
                  }}
                  type='button'
                  variant='ghost'
                >
                  Dismiss
                </Button>
              </div>
            </section>
          ) : reviewed && reviewedSourceChain ? (
            <section className='grid gap-3 rounded-md border p-3' aria-label='Reviewed Squid deposit'>
              <p>
                <span className='text-muted-foreground'>Spend:</span> {reviewed.amount} {reviewed.sourceSymbol}
              </p>
              <p>
                <span className='text-muted-foreground'>From:</span> {formatAddress(reviewed.context.owner)} on{" "}
                {reviewedSourceChain.name}
              </p>
              <div>
                <span className='text-muted-foreground'>Squid fees:</span>{" "}
                {reviewed.quote.fees.length === 0 ? (
                  "None"
                ) : (
                  <ul className='mt-1 list-inside list-disc'>
                    {reviewed.quote.fees.map((fee, index) => (
                      <li key={`${fee.name}:${fee.token.chainId}:${fee.token.address}:${index}`}>
                        {formatUnits(fee.amount, fee.token.decimals)} {fee.token.symbol} ({fee.name})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p>
                <span className='text-muted-foreground'>Network gas maximum:</span>{" "}
                {formatUnits(reviewed.maxNativeFee, reviewedSourceChain.nativeCurrency.decimals)}{" "}
                {reviewedSourceChain.nativeCurrency.symbol}
              </p>
              <p>
                <span className='text-muted-foreground'>Maximum native required:</span>{" "}
                {formatUnits(reviewed.requiredNative, reviewedSourceChain.nativeCurrency.decimals)}{" "}
                {reviewedSourceChain.nativeCurrency.symbol}
              </p>
              <p>
                <span className='text-muted-foreground'>Receive at least:</span>{" "}
                {formatUnits(reviewed.quote.minimumDestinationAmount, 18)} USDFC
              </p>
              {reviewed.quote.filGasTopUp ? (
                <p>
                  <span className='text-muted-foreground'>Wallet top-up:</span> At least{" "}
                  {formatUnits(FIL_GAS_TOP_UP_AMOUNT, 18)} FIL for transaction fees, using{" "}
                  {formatUnits(reviewed.quote.filGasTopUp.spendUsdfc, 18)} USDFC
                </p>
              ) : null}
              <p>
                <span className='text-muted-foreground'>Destination:</span> Filecoin Pay account{" "}
                {formatAddress(reviewed.context.recipient)}
              </p>
              <p className='text-muted-foreground'>
                Your wallet will confirm
                {isNativeToken(reviewed.context.sourceToken)
                  ? " the Squid transaction."
                  : reviewed.approvalResetRequired
                    ? " an allowance reset, an approval, then the Squid transaction."
                    : reviewed.approvalRequired
                      ? " an approval, then the Squid transaction."
                      : " the Squid transaction."}
              </p>
            </section>
          ) : (
            <>
              <div className='grid gap-1'>
                <Label htmlFor='direct-squid-wallet'>Paying wallet</Label>
                <select
                  id='direct-squid-wallet'
                  className='h-10 rounded-md border bg-background px-3'
                  disabled={busy}
                  value={payingWallet?.address ?? ""}
                  onChange={(event) => {
                    setPayingAddress(event.target.value);
                    setReviewed(null);
                  }}
                >
                  {wallets.map((wallet) => (
                    <option key={wallet.address} value={wallet.address}>
                      {formatAddress(wallet.address)}
                    </option>
                  ))}
                </select>
              </div>
              <div className='grid gap-1'>
                <Label htmlFor='direct-squid-chain'>Source network</Label>
                <select
                  id='direct-squid-chain'
                  className='h-10 rounded-md border bg-background px-3'
                  disabled={busy}
                  value={sourceChainId}
                  onChange={(event) => {
                    setSourceChainId(Number(event.target.value));
                    setSourceTokenAddress("");
                    initializedSelectionScope.current = "";
                    setReviewed(null);
                  }}
                >
                  {SQUID_SOURCE_CHAINS.filter((chain) => chain.id !== mainnet.id).map((chain) => (
                    <option key={chain.id} value={chain.id}>
                      {chain.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className='grid gap-1'>
                <Label htmlFor='direct-squid-token'>Source token</Label>
                <SearchableSelect
                  id='direct-squid-token'
                  disabled={busy || tokensQuery.isPending}
                  invalidMessage='Choose a supported source token.'
                  onValueChange={(value) => {
                    setSourceTokenAddress(value);
                    setReviewed(null);
                  }}
                  options={tokenOptions}
                  placeholder={tokensQuery.isPending ? "Loading tokens…" : "Search tokens"}
                  value={sourceTokenAddress}
                />
                {tokensQuery.isError ? (
                  <div className='flex items-center justify-between gap-2 text-sm text-destructive' role='alert'>
                    <span>Supported tokens could not be loaded.</span>
                    <Button onClick={() => void tokensQuery.refetch()} size='compact' type='button' variant='tertiary'>
                      Retry
                    </Button>
                  </div>
                ) : null}
                {!tokensQuery.isPending && !tokensQuery.isError && tokens.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>No supported tokens are available on this network.</p>
                ) : null}
              </div>
              <div className='grid gap-1'>
                <Label htmlFor='direct-squid-amount'>Amount ({sourceToken?.symbol ?? "source token"})</Label>
                <Input
                  id='direct-squid-amount'
                  inputMode='decimal'
                  disabled={busy}
                  onChange={(value) => {
                    setAmount(value);
                    setReviewed(null);
                  }}
                  placeholder='0.00'
                  value={amount}
                />
                {balancesQuery.data && !balancesQuery.isError && sourceToken ? (
                  <p className='text-xs text-muted-foreground'>
                    Balance: {formatUnits(balancesQuery.data.token, sourceToken.decimals)} {sourceToken.symbol}
                  </p>
                ) : null}
                {balancesQuery.isError && sourceToken ? (
                  <div className='flex items-center justify-between gap-2 text-sm text-destructive' role='alert'>
                    <span>{sourceToken.symbol} balance is unavailable.</span>
                    <Button
                      onClick={() => void balancesQuery.refetch()}
                      size='compact'
                      type='button'
                      variant='tertiary'
                    >
                      Retry
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className='flex items-start gap-3 rounded-md bg-muted/50 p-3'>
                <input
                  checked={includeFilGas}
                  className='mt-0.5 h-4 w-4 accent-primary'
                  id='direct-squid-fil-gas'
                  onChange={(event) => {
                    setIncludeFilGas(event.target.checked);
                    setReviewed(null);
                  }}
                  type='checkbox'
                />
                <div className='grid gap-1'>
                  <Label htmlFor='direct-squid-fil-gas'>Add 0.25 FIL for transaction fees</Label>
                  <p className='text-xs text-muted-foreground'>
                    Add FIL to your wallet so you can deposit USDFC and make other Filecoin transactions.
                  </p>
                  {quote?.filGasTopUp ? (
                    <p className='text-xs text-muted-foreground'>
                      Uses {formatUnits(quote.filGasTopUp.spendUsdfc, 18)} USDFC from the amount received.
                    </p>
                  ) : null}
                </div>
              </div>
              {quoteQuery.isFetching ? (
                <p className='inline-flex items-center gap-2 text-muted-foreground'>
                  <Loader2 className='h-4 w-4 animate-spin' /> Fetching a quote…
                </p>
              ) : null}
              {quoteQuery.error ? (
                <p className='text-destructive'>
                  {walletErrorMessage(quoteQuery.error, "Squid could not quote this amount.")}
                </p>
              ) : null}
              {!sourceIsNative &&
              parsedAmount !== null &&
              !balancesQuery.isError &&
              balancesQuery.data &&
              balancesQuery.data.token < parsedAmount ? (
                <p className='text-destructive'>The paying wallet does not have enough {sourceToken?.symbol}.</p>
              ) : null}
              {requiredNative !== null &&
              !balancesQuery.isError &&
              balancesQuery.data &&
              balancesQuery.data.native < requiredNative ? (
                <p className='text-destructive'>
                  The paying wallet does not have enough {sourceChain?.nativeCurrency.symbol ?? "native token"} for{" "}
                  {sourceIsNative ? "the payment and gas" : "source-network fees"}.
                </p>
              ) : null}
            </>
          )}
          {transactionHash && !pending ? <code className='break-all text-xs'>{transactionHash}</code> : null}
          {error ? (
            <p className='text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={busy}
            onClick={() => (reviewed ? setReviewed(null) : void close())}
            type='button'
            variant='ghost'
          >
            {reviewed ? "Back" : "Close"}
          </Button>
          {!pending && !reviewed ? (
            <Button
              disabled={!canReview}
              onClick={() => {
                if (
                  !quote ||
                  !recipient ||
                  !payingWallet ||
                  !sourceToken ||
                  parsedAmount === null ||
                  !balancesQuery.data ||
                  networkFeeMaximum === null ||
                  requiredNative === null
                )
                  return;
                setReviewed({
                  approvalRequired: !sourceIsNative && balancesQuery.data.allowance !== parsedAmount,
                  approvalResetRequired:
                    !sourceIsNative &&
                    balancesQuery.data.allowance > 0n &&
                    balancesQuery.data.allowance !== parsedAmount,
                  amount,
                  context: {
                    owner: getAddress(payingWallet.address),
                    recipient,
                    sourceAmount: parsedAmount,
                    sourceChainId,
                    sourceToken: getAddress(sourceToken.token),
                  },
                  maxNativeFee: networkFeeMaximum,
                  quote,
                  requiredNative,
                  sourceDecimals: sourceToken.decimals,
                  sourceSymbol: sourceToken.symbol,
                });
              }}
              type='button'
              variant='primary'
            >
              Review
            </Button>
          ) : null}
          {!pending && reviewed ? (
            <Button disabled={busy} onClick={() => void confirm()} type='button' variant='primary'>
              {busy ? "Processing…" : `Pay ${reviewed.amount} ${reviewed.sourceSymbol}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
