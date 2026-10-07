"use client";

import { type ConnectedWallet, useFiatOnramp, useLoginWithSiwe, usePrivy, useWallets } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { erc20Abi, getAddress, isAddress, type PublicClient } from "viem";
import { usePublicClient, useSignMessage } from "wagmi";
import { getAccount } from "wagmi/actions";
import { isLinkedWallet } from "@/components/UserConsole/console-wallet";
import { config } from "@/services/wagmi/config";
import { invalidateSourceBalanceQueries } from "@/utils/query-invalidation";
import { withSquidAcquisitionLock } from "../data/squid-acquisition-lock";

export const CARD_CHAIN_ID = 8453;
export const CARD_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const CARD_USDC_DECIMALS = 6;
const BALANCE_ATTEMPTS = 30;
const BALANCE_INTERVAL_MS = 2_000;

type WaitResult = { balance: bigint; status: "funded" } | { status: "changed" } | { status: "delayed" };
type PurchaseContext = { before: bigint; contextKey: string; recipient: `0x${string}` };
type LoginContext = Omit<PurchaseContext, "before">;
type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const CARD_PURCHASE_STORAGE_PREFIX = "filecoin-pay:card-purchase:v1";

function getCardPurchaseStorageKey(recipient: string) {
  return `${CARD_PURCHASE_STORAGE_PREFIX}:${recipient.toLowerCase()}`;
}

function getCardPurchaseStorage(): StorageLike {
  if (typeof window === "undefined") throw new Error("Card purchase recovery requires browser storage");
  return window.localStorage;
}

function savePendingCardPurchase(pending: PurchaseContext) {
  getCardPurchaseStorage().setItem(
    getCardPurchaseStorageKey(pending.recipient),
    JSON.stringify({ ...pending, before: pending.before.toString(), submitted: true }),
  );
}

function loadPendingCardPurchase(recipient: string): PurchaseContext | null {
  try {
    const value = getCardPurchaseStorage().getItem(getCardPurchaseStorageKey(recipient));
    if (!value) return null;
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof parsed.before !== "string" ||
      !/^\d+$/.test(parsed.before) ||
      typeof parsed.contextKey !== "string" ||
      typeof parsed.recipient !== "string" ||
      parsed.submitted !== true ||
      !isAddress(parsed.recipient) ||
      parsed.recipient.toLowerCase() !== recipient.toLowerCase()
    )
      return null;
    return { before: BigInt(parsed.before), contextKey: parsed.contextKey, recipient: getAddress(parsed.recipient) };
  } catch {
    return null;
  }
}

function clearPendingCardPurchase(recipient: string) {
  getCardPurchaseStorage().removeItem(getCardPurchaseStorageKey(recipient));
}

export async function waitForPurchasedUsdc({
  attempts = BALANCE_ATTEMPTS,
  before,
  isCurrent,
  read,
  wait = () => new Promise<void>((resolve) => setTimeout(resolve, BALANCE_INTERVAL_MS)),
}: {
  attempts?: number;
  before: bigint;
  isCurrent: () => boolean;
  read: () => Promise<bigint>;
  wait?: () => Promise<void>;
}): Promise<WaitResult> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!isCurrent()) return { status: "changed" };
    try {
      const balance = await read();
      if (balance > before) return isCurrent() ? { balance, status: "funded" } : { status: "changed" };
    } catch {
      // A transient RPC failure is indistinguishable from delayed settlement; retry within the same bounded window.
    }
    if (attempt + 1 < attempts) await wait();
  }
  return { status: isCurrent() ? "delayed" : "changed" };
}

function readUsdcBalance(client: Pick<PublicClient, "readContract">, recipient: `0x${string}`) {
  return client.readContract({ abi: erc20Abi, address: CARD_USDC, args: [recipient], functionName: "balanceOf" });
}

function reportWalletChanged() {
  toast.error("Wallet changed during card purchase", {
    description: "Return to the original wallet to check for purchased USDC before starting again.",
  });
}

function reportBaseClientUnavailable() {
  toast.error("Card purchase unavailable", { description: "The Base network client is not configured." });
}

function isFundingExit(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error && error.code === 4001) return true;
  const raw = error instanceof Error ? error.message : error;
  const message = (typeof raw === "string" ? raw : "").trim();
  return (
    /^user exited\b/i.test(message) ||
    /\bcancell?ed$/i.test(message) ||
    /^user rejected\b/i.test(message) ||
    /_exited$/i.test(message)
  );
}

// Privy rejects once it stops confirming a payment (after ten minutes, or when its status checks keep failing), but
// the payment can still settle, so it is tracked like a submission.
// ponytail: matches Privy 3.43's wording; recheck after a Privy upgrade.
function isUnconfirmedPurchase(error: unknown) {
  return error instanceof Error && /^(could not confirm|unable to check) payment status\b/i.test(error.message);
}

function getOnrampEnvironment() {
  return /^(1|true|yes|on)$/i.test(process.env.NEXT_PUBLIC_PRIVY_ONRAMP_SANDBOX?.trim() ?? "")
    ? "sandbox"
    : "production";
}

export function useCardPurchase({
  address,
  contextKey,
  isPickerOpen,
  onPurchased,
}: {
  address: string;
  contextKey: string;
  /** Closing the picker pauses the balance check, so a late arrival never opens Squid over other work. */
  isPickerOpen: boolean;
  onPurchased: (amount: bigint) => void;
}) {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  // A Privy login only counts for its own wallets, never for an account the extension switched to.
  const isLoggedInAsRecipient = isLinkedWallet(user, address);
  const { fund } = useFiatOnramp();
  const { generateSiweMessage, loginWithSiwe } = useLoginWithSiwe();
  const { mutateAsync: signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient({ chainId: CARD_CHAIN_ID });
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"delayed" | "idle" | "opening" | "verifying" | "waiting">("idle");
  const pendingPurchase = useRef<PurchaseContext | null>(null);
  const isMounted = useRef(true);
  const latestContext = useRef(contextKey);
  latestContext.current = contextKey;
  // Each balance check runs under its own number; a newer number ends the older check.
  const checkRun = useRef(0);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (isPickerOpen) return;
    checkRun.current += 1;
    setStatus((current) => (current === "waiting" ? "delayed" : current));
  }, [isPickerOpen]);

  useEffect(() => {
    const restored = loadPendingCardPurchase(address);
    if (!restored || pendingPurchase.current) return;
    pendingPurchase.current = restored;
    setStatus("delayed");
  }, [address]);

  const isCurrent = ({ contextKey: startedContext, recipient }: LoginContext) =>
    isMounted.current &&
    latestContext.current === startedContext &&
    getAccount(config).address?.toLowerCase() === recipient.toLowerCase();
  const checkPendingPurchase = async () => {
    const pending = pendingPurchase.current;
    if (!pending) return;
    if (!publicClient) return reportBaseClientUnavailable();
    checkRun.current += 1;
    const run = checkRun.current;
    const current = () => isCurrent(pending) && checkRun.current === run;
    setStatus("waiting");
    const landed = await waitForPurchasedUsdc({
      before: pending.before,
      isCurrent: current,
      read: () => readUsdcBalance(publicClient, pending.recipient),
    });
    // Closing the picker or Start over ended this check and already set the status.
    if (checkRun.current !== run) return;
    if (landed.status === "changed") {
      if (isMounted.current) {
        setStatus("delayed");
        reportWalletChanged();
      }
      return;
    }
    if (landed.status === "delayed") {
      setStatus("delayed");
      return;
    }

    pendingPurchase.current = null;
    clearPendingCardPurchase(pending.recipient);
    void invalidateSourceBalanceQueries(queryClient, pending.recipient, CARD_CHAIN_ID);
    setStatus("idle");
    onPurchased(landed.balance - pending.before);
  };

  const purchase = async (requested?: LoginContext) => {
    if (!publicClient) return reportBaseClientUnavailable();
    const intent = requested ?? { contextKey, recipient: getAddress(address) };
    let purchaseStatus: "confirmed" | "submitted" | undefined;

    setStatus("opening");
    try {
      if (!isCurrent(intent)) {
        if (isMounted.current) setStatus("idle");
        return;
      }
      const pending = await withSquidAcquisitionLock(globalThis.navigator?.locks, intent.recipient, async () => {
        const existing = loadPendingCardPurchase(intent.recipient);
        if (existing) return existing;
        const before = await readUsdcBalance(publicClient, intent.recipient);
        if (!isCurrent(intent)) return null;
        const next = { before, ...intent };
        const result = await fund({
          source: {},
          destination: { address: intent.recipient, asset: CARD_USDC, chain: `eip155:${CARD_CHAIN_ID}` },
          environment: getOnrampEnvironment(),
        }).catch((error: unknown) => {
          if (isUnconfirmedPurchase(error)) return { status: "submitted" as const };
          throw error;
        });
        purchaseStatus = result.status;
        pendingPurchase.current = next;
        savePendingCardPurchase(next);
        return next;
      });
      if (!pending) {
        if (isMounted.current) setStatus("idle");
        return;
      }
      pendingPurchase.current = pending;
      if (!purchaseStatus) {
        setStatus("delayed");
        return;
      }
      if (!isCurrent(intent)) {
        setStatus("delayed");
        reportWalletChanged();
        return;
      }
      await checkPendingPurchase();
    } catch (error) {
      if (purchaseStatus) {
        if (isMounted.current) setStatus("delayed");
        return;
      }
      pendingPurchase.current = null;
      if (!isFundingExit(error)) {
        toast.error("Card purchase failed", {
          description: error instanceof Error ? error.message : "Privy card funding is unavailable.",
        });
      }
      if (isMounted.current) setStatus("idle");
    }
  };

  // Signs in as the recipient itself, so card funding never adds another wallet or identity. Headless SIWE
  // settles only after Privy is signed in, unlike Privy's modal flows, whose login callbacks may never fire.
  const verifyThenPurchase = async (wallet: ConnectedWallet, intent: LoginContext) => {
    setStatus("verifying");
    try {
      const chainId = Number(wallet.chainId.replace("eip155:", ""));
      const message = await generateSiweMessage({ address: intent.recipient, chainId: `eip155:${chainId}` });
      // Naming the recipient makes the wallet sign as it or refuse, never as whichever account it has selected.
      const signature = await signMessageAsync({ account: intent.recipient, message });
      await loginWithSiwe({
        message,
        signature,
        walletClientType: wallet.walletClientType,
        connectorType: wallet.connectorType,
      });
    } catch (error) {
      if (isMounted.current) setStatus("idle");
      if (!isFundingExit(error)) {
        toast.error("Unable to verify wallet", { description: error instanceof Error ? error.message : undefined });
      }
      return;
    }
    if (!isCurrent(intent)) {
      if (isMounted.current) {
        setStatus("idle");
        toast.error("Wallet changed during login", {
          description: "Return to Add funds from the account you want to fund.",
        });
      }
      return;
    }
    await purchase(intent);
  };

  // A purchase that never lands would otherwise pin this account on "Check for
  // purchased USDC" for good; the picker asks for confirmation before calling this.
  const startOver = () => {
    const pending = pendingPurchase.current;
    pendingPurchase.current = null;
    checkRun.current += 1;
    if (pending) {
      try {
        clearPendingCardPurchase(pending.recipient);
      } catch {
        // Without storage there is nothing persisted to clear.
      }
    }
    setStatus("idle");
  };

  const buyWithCard = () => {
    if (status === "opening" || status === "verifying" || status === "waiting") return;
    if (pendingPurchase.current || status === "delayed") return checkPendingPurchase();
    if (isLoggedInAsRecipient) return purchase();
    // Privy refuses to log in over another login, and the console account provider is already ending it.
    if (authenticated) {
      toast.error("Card purchase unavailable", {
        description: "Finishing the previous sign-out. Try again in a moment.",
      });
      return;
    }
    const recipientWallet = wallets.find((wallet) => wallet.address.toLowerCase() === address.toLowerCase());
    if (!recipientWallet) {
      toast.error("Card purchase unavailable", { description: "Reconnect your wallet and try again." });
      return;
    }
    return verifyThenPurchase(recipientWallet, { contextKey, recipient: getAddress(address) });
  };

  const purchaseLabel = isLoggedInAsRecipient ? "Buy USDC with card" : "Verify wallet to buy USDC with card";
  // Privy reports "submitted" both for a payment still settling and for a provider window closed without paying.
  const statusMessages = {
    delayed:
      "No purchased USDC on Base yet. If you paid, check again in a few minutes. If you closed the purchase without paying, choose Start over.",
    idle: null,
    opening: "Opening card purchase…",
    verifying: "Confirm the sign-in message in your wallet…",
    waiting: "Looking for purchased USDC on Base… If you closed the purchase without paying, choose Start over.",
  };
  const isPending = status === "delayed" || status === "waiting";
  return {
    buyWithCard,
    canStartOver: isPending,
    // Only Privy's own windows hold the picker; the balance check does not.
    isBusy: status === "opening" || status === "verifying",
    isChecking: status === "waiting",
    label: isPending ? "Check for purchased USDC" : purchaseLabel,
    startOver,
    statusMessage: statusMessages[status],
  };
}
