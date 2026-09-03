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
import { useAccount, usePublicClient } from "wagmi";
import { mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { formatAddress } from "@/utils/formatter";
import { invalidateTopUpQueries } from "../data/guided-top-up";
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
  getDepositRequiredNativeBalance,
  getSourceNativeCosts,
  isExecutableQuote,
  requestSquidDepositRoute,
  type SquidDepositQuote,
  type SquidDepositRouteRequest,
} from "../data/squid-deposit-route";
import { claimSquidDepositSubmission, releaseSquidDepositSubmission } from "../data/squid-deposit-submit";
import {
  clearPendingSquidDeposit,
  loadPendingSquidDeposit,
  type PendingSquidDeposit,
  savePendingSquidDeposit,
} from "../data/squid-deposit-tracker";
import { walletErrorMessage } from "../data/squid-execution";
import { squidFetch } from "../data/squid-quote";
import { usdcTokensQueryOptions } from "../data/squid-usdc-tokens";

const APPROVAL_GAS_UNITS = 60_000n;
const DEFAULT_SOURCE_CHAIN = 8453;
const DEPOSIT_TARGET = {
  payments: mainnet.contracts.payments.address,
  usdfc: mainnet.contracts.usdfc.address,
};

type ContextSnapshot = {
  owner: Address;
  recipient: Address;
  sourceChainId: number;
  sourceToken: Address;
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
  const queryClient = useQueryClient();
  const [payingAddress, setPayingAddress] = useState("");
  const [sourceChainId, setSourceChainId] = useState(DEFAULT_SOURCE_CHAIN);
  const [sourceTokenAddress, setSourceTokenAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [reviewedQuote, setReviewedQuote] = useState<SquidDepositQuote | null>(null);
  const [stage, setStage] = useState<SquidDepositStage | "preparing" | null>(null);
  const [transactionHash, setTransactionHash] = useState<Hash | null>(null);
  const [pending, setPending] = useState<PendingSquidDeposit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const latestContext = useRef<{ open: boolean; recipient?: string; owner?: string; chainId: number; token?: string }>({
    open,
    recipient: connectedRecipient,
    chainId: sourceChainId,
  });

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
  const tokensQuery = useQuery({ ...usdcTokensQueryOptions(sourceChainId, squid), enabled: open });
  const sourceToken =
    tokensQuery.data?.find((token) => token.token.toLowerCase() === sourceTokenAddress.toLowerCase()) ??
    tokensQuery.data?.[0];
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
      const [token, native, gasPrice, allowance] = await Promise.all([
        sourceClient.readContract({
          abi: erc20Abi,
          address: sourceToken.token,
          args: [owner],
          functionName: "balanceOf",
        }),
        sourceClient.getBalance({ address: owner }),
        sourceClient.getGasPrice(),
        sourceClient.readContract({
          abi: erc20Abi,
          address: sourceToken.token,
          args: [owner, SQUID_ROUTER_ADDRESS],
          functionName: "allowance",
        }),
      ]);
      return { allowance, gasPrice, native, token };
    },
    queryKey: ["direct-squid-deposit-balances", sourceChainId, sourceToken?.token, payingWallet?.address],
    refetchInterval: 15_000,
  });
  const quoteQuery = useQuery({
    enabled:
      open &&
      !reviewedQuote &&
      !!recipient &&
      !!payingWallet &&
      !!sourceToken &&
      parsedAmount !== null &&
      (balancesQuery.data?.token ?? 0n) >= parsedAmount,
    queryFn: () => {
      if (!recipient || !payingWallet || !sourceToken || parsedAmount === null) throw new Error("Quote unavailable");
      return requestSquidDepositRoute(
        {
          ...DEPOSIT_TARGET,
          owner: getAddress(payingWallet.address),
          recipient,
          sourceAmount: parsedAmount,
          sourceChainId,
          sourceToken: sourceToken.token,
        },
        squid,
        { quoteOnly: true },
      );
    },
    queryKey: [
      "direct-squid-deposit-quote",
      recipient,
      payingWallet?.address,
      sourceChainId,
      sourceToken?.token,
      parsedAmount?.toString(),
    ],
    retry: false,
  });

  latestContext.current = {
    open,
    recipient,
    owner: payingWallet?.address,
    chainId: sourceChainId,
    token: sourceToken?.token,
  };

  useEffect(() => {
    if (!open || !recipient) return;
    setError(null);
    setReviewedQuote(null);
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
      setPayingAddress(saved.owner);
      setSourceChainId(saved.sourceChainId);
      setSourceTokenAddress(saved.sourceToken);
    }
  }, [open, recipient, wallets]);

  const assertContext = (snapshot: ContextSnapshot) => {
    const current = latestContext.current;
    if (
      !current.open ||
      current.recipient?.toLowerCase() !== snapshot.recipient.toLowerCase() ||
      current.owner?.toLowerCase() !== snapshot.owner.toLowerCase() ||
      current.chainId !== snapshot.sourceChainId ||
      current.token?.toLowerCase() !== snapshot.sourceToken.toLowerCase()
    ) {
      throw new Error("Funding details changed after review. Review the payment again.");
    }
  };

  const clearSaved = (owner: Address) => {
    try {
      clearPendingSquidDeposit(window.localStorage, owner);
    } catch {
      // The on-chain result remains authoritative when storage is unavailable.
    }
    setPending(null);
  };

  const finish = async (owner: Address, depositRecipient: Address, depositedAmount: bigint) => {
    clearSaved(owner);
    setStage(null);
    setTransactionHash(null);
    toast.success(`Deposited ${formatUnits(depositedAmount, 18)} USDFC into Filecoin Pay`);
    await invalidateTopUpQueries(queryClient, accountId, depositRecipient);
    onOpenChange(false);
  };

  const fail = (failure: unknown, owner?: Address) => {
    setStage(null);
    if (failure instanceof SquidDepositError) {
      setError(failure.message);
      if (failure.reason !== "timeout" && owner) clearSaved(owner);
    } else {
      setError(walletErrorMessage(failure, "The USDC deposit could not be completed."));
    }
  };

  const resume = async () => {
    if (!pending || !recipient || !destinationClient || !claimSquidDepositSubmission(submitting)) return;
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
          onStage: (next, hash) => {
            setStage(next);
            if (hash) setTransactionHash(hash);
          },
          quoteId: pending.quoteId,
          sourceChainId: pending.sourceChainId,
          squid,
          target: { ...DEPOSIT_TARGET, recipient: pending.recipient },
          transactionHash: pending.transactionHash,
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
      if (
        !recipient ||
        !payingWallet ||
        !sourceToken ||
        !sourceChain ||
        !sourceClient ||
        !destinationClient ||
        !reviewedQuote ||
        parsedAmount === null ||
        !balancesQuery.data
      ) {
        throw new Error("Review a current Squid quote before confirming.");
      }
      const snapshot: ContextSnapshot = {
        owner: getAddress(payingWallet.address),
        recipient,
        sourceChainId,
        sourceToken: getAddress(sourceToken.token),
      };
      assertContext(snapshot);
      const request: SquidDepositRouteRequest = {
        ...DEPOSIT_TARGET,
        ...snapshot,
        sourceAmount: parsedAmount,
      };
      const reviewedCaps = captureReviewedSquidDepositCaps(reviewedQuote);
      const reviewedNativeGas =
        ((getSourceNativeCosts(reviewedQuote, sourceChainId).gas + APPROVAL_GAS_UNITS * balancesQuery.data.gasPrice) *
          3n) /
        2n;

      await withSquidAcquisitionLock(globalThis.navigator?.locks, snapshot.owner, async () => {
        assertContext(snapshot);
        setStage("preparing");
        await payingWallet.switchChain(sourceChainId);
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
        const result = await executeSquidDeposit({
          assertCurrentContext: () => assertContext(snapshot),
          destinationClient: destinationClient as SquidDepositDestinationClient,
          getCurrentOwner: async () => {
            const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
            return accounts[0] ? getAddress(accounts[0]) : undefined;
          },
          maxNativeGas: reviewedNativeGas,
          onBroadcast: ({ fundsBefore, transactionHash: hash }) => {
            const saved: PendingSquidDeposit = {
              fundsBefore,
              minimumDestinationAmount: executable.minimumDestinationAmount,
              owner: snapshot.owner,
              quoteId: executable.quoteId,
              recipient: snapshot.recipient,
              sourceAmount: parsedAmount,
              sourceChainId,
              sourceDecimals: sourceToken.decimals,
              sourceSymbol: sourceToken.symbol,
              sourceToken: snapshot.sourceToken,
              startedAt: Date.now(),
              transactionHash: hash,
            };
            setTransactionHash(hash);
            try {
              setPending(savePendingSquidDeposit(window.localStorage, saved));
            } catch {
              setPending(saved);
            }
          },
          onStage: (next, hash) => {
            setStage(next);
            if (hash) setTransactionHash(hash);
          },
          quote: executable,
          request,
          sourceClient: sourceClient as SquidDepositSourceClient,
          squid,
          walletClient,
        });
        await finish(snapshot.owner, snapshot.recipient, result.depositedAmount);
      });
    } catch (failure) {
      fail(failure, payingWallet ? getAddress(payingWallet.address) : undefined);
    } finally {
      releaseSquidDepositSubmission(submitting);
    }
  };

  const quote = quoteQuery.data;
  const nativeCosts = quote ? getSourceNativeCosts(quote, sourceChainId) : null;
  const requiredNative =
    quote && balancesQuery.data
      ? getDepositRequiredNativeBalance(quote, sourceChainId, APPROVAL_GAS_UNITS * balancesQuery.data.gasPrice)
      : null;
  const canReview =
    !!quote &&
    parsedAmount !== null &&
    !!balancesQuery.data &&
    balancesQuery.data.token >= parsedAmount &&
    requiredNative !== null &&
    balancesQuery.data.native >= requiredNative;
  const busy = stage !== null;
  const explorerUrl = sourceChain?.blockExplorers?.default.url;

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next && submitting.current) return;
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>{reviewedQuote ? "Review USDC deposit" : "Pay with USDC"}</DialogTitle>
          <DialogDescription>
            Squid swaps USDC to USDFC and deposits it directly into Filecoin Pay. There is no Filecoin wallet signature
            and no FIL is required.
            {recipient ? (
              <span className='mt-1 block font-mono text-xs'>Pay account {formatAddress(recipient)}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 text-sm'>
          {pending ? (
            <section className='grid gap-3 rounded-md border p-3' aria-label='Pending Squid deposit'>
              <p>{stage ? `Deposit status: ${stage}` : "A USDC deposit is still in progress."}</p>
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
                  Squid route
                </a>
              </div>
              <div className='flex gap-2'>
                <Button disabled={busy} onClick={() => void resume()} type='button' variant='primary'>
                  Check again
                </Button>
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
          ) : reviewedQuote && sourceToken && sourceChain && payingWallet ? (
            <section className='grid gap-3 rounded-md border p-3' aria-label='Reviewed Squid deposit'>
              <p>
                <span className='text-muted-foreground'>Spend:</span> {amount} {sourceToken.symbol}
              </p>
              <p>
                <span className='text-muted-foreground'>From:</span> {formatAddress(payingWallet.address)} on{" "}
                {sourceChain.name}
              </p>
              <p>
                <span className='text-muted-foreground'>Route fees:</span>{" "}
                {formatUnits(nativeCosts?.fees ?? 0n, sourceChain.nativeCurrency.decimals)}{" "}
                {sourceChain.nativeCurrency.symbol}
              </p>
              <p>
                <span className='text-muted-foreground'>Network gas maximum:</span>{" "}
                {requiredNative === null
                  ? "Unavailable"
                  : `${formatUnits(requiredNative, sourceChain.nativeCurrency.decimals)} ${sourceChain.nativeCurrency.symbol}`}
              </p>
              <p>
                <span className='text-muted-foreground'>Receive at least:</span>{" "}
                {formatUnits(reviewedQuote.minimumDestinationAmount, 18)} USDFC
              </p>
              <p>
                <span className='text-muted-foreground'>Destination:</span> Filecoin Pay account{" "}
                {formatAddress(recipient ?? "")}
              </p>
              <p className='text-muted-foreground'>
                Your wallet will confirm the USDC approval when needed, then the Squid transaction.
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
                    setReviewedQuote(null);
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
                    setReviewedQuote(null);
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
                <Label htmlFor='direct-squid-token'>USDC token</Label>
                <select
                  id='direct-squid-token'
                  className='h-10 rounded-md border bg-background px-3'
                  disabled={busy || tokensQuery.isPending}
                  value={sourceToken?.token ?? ""}
                  onChange={(event) => {
                    setSourceTokenAddress(event.target.value);
                    setReviewedQuote(null);
                  }}
                >
                  {(tokensQuery.data ?? []).map((token) => (
                    <option key={token.token} value={token.token}>
                      {token.symbol} ({formatAddress(token.token)})
                    </option>
                  ))}
                </select>
              </div>
              <div className='grid gap-1'>
                <Label htmlFor='direct-squid-amount'>Amount (USDC)</Label>
                <Input
                  id='direct-squid-amount'
                  inputMode='decimal'
                  disabled={busy}
                  onChange={(value) => {
                    setAmount(value);
                    setReviewedQuote(null);
                  }}
                  placeholder='0.00'
                  value={amount}
                />
                {balancesQuery.data && sourceToken ? (
                  <p className='text-xs text-muted-foreground'>
                    Balance: {formatUnits(balancesQuery.data.token, sourceToken.decimals)} {sourceToken.symbol}
                  </p>
                ) : null}
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
              {parsedAmount !== null && balancesQuery.data && balancesQuery.data.token < parsedAmount ? (
                <p className='text-destructive'>The paying wallet does not have enough USDC.</p>
              ) : null}
              {requiredNative !== null && balancesQuery.data && balancesQuery.data.native < requiredNative ? (
                <p className='text-destructive'>
                  The paying wallet does not have enough {sourceChain?.nativeCurrency.symbol ?? "native token"} for
                  source-network gas.
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
            onClick={() => (reviewedQuote ? setReviewedQuote(null) : onOpenChange(false))}
            type='button'
            variant='ghost'
          >
            {reviewedQuote ? "Back" : "Close"}
          </Button>
          {!pending && !reviewedQuote ? (
            <Button
              disabled={!canReview}
              onClick={() => quote && setReviewedQuote(quote)}
              type='button'
              variant='primary'
            >
              Review
            </Button>
          ) : null}
          {!pending && reviewedQuote ? (
            <Button disabled={busy} onClick={() => void confirm()} type='button' variant='primary'>
              {busy ? "Processing…" : `Pay ${amount} ${sourceToken?.symbol ?? "USDC"}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
