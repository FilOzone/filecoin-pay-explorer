"use client";

import { useFiatOnramp, useLogin, usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { erc20Abi, getAddress } from "viem";
import { usePublicClient } from "wagmi";
import { getAccount } from "wagmi/actions";
import { config } from "@/services/wagmi/config";

export const CARD_CHAIN_ID = 8453;
export const CARD_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const CARD_USDC_DECIMALS = 6;
const BALANCE_ATTEMPTS = 30;
const BALANCE_INTERVAL_MS = 2_000;

type WaitResult = { balance: bigint; status: "funded" } | { status: "changed" } | { status: "delayed" };
type PurchaseContext = { before: bigint; contextKey: string; recipient: `0x${string}` };
type LoginContext = Omit<PurchaseContext, "before">;

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

function isFundingExit(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error && error.code === 4001) return true;
  const message = (error instanceof Error ? error.message : typeof error === "string" ? error : "").trim();
  return (
    message === "" ||
    /^user exited\b/i.test(message) ||
    /\bcancell?ed$/i.test(message) ||
    /^user rejected\b/i.test(message) ||
    /_exited$/i.test(message)
  );
}

function onrampEnvironment() {
  return /^(1|true|yes|on)$/i.test(process.env.NEXT_PUBLIC_PRIVY_ONRAMP_SANDBOX?.trim() ?? "")
    ? "sandbox"
    : "production";
}

export function useCardPurchase({
  address,
  contextKey,
  onPurchased,
}: {
  address: string;
  contextKey: string;
  onPurchased: (amount: bigint) => void;
}) {
  const { authenticated } = usePrivy();
  const { fund } = useFiatOnramp();
  const publicClient = usePublicClient({ chainId: CARD_CHAIN_ID });
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"delayed" | "idle" | "opening" | "waiting">("idle");
  const continueAfterLogin = useRef<LoginContext | null>(null);
  const pendingPurchase = useRef<PurchaseContext | null>(null);
  const mounted = useRef(true);
  const latestContext = useRef(contextKey);
  latestContext.current = contextKey;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isCurrent = ({ contextKey: startedContext, recipient }: LoginContext) =>
    mounted.current &&
    latestContext.current === startedContext &&
    getAccount(config).address?.toLowerCase() === recipient.toLowerCase();
  const read = (recipient: `0x${string}`) =>
    publicClient?.readContract({ abi: erc20Abi, address: CARD_USDC, args: [recipient], functionName: "balanceOf" });

  const checkPendingPurchase = async (submitted = false) => {
    const pending = pendingPurchase.current;
    if (!pending || !publicClient) return;
    const current = () => isCurrent(pending);
    setStatus("waiting");
    const landed = await waitForPurchasedUsdc({
      before: pending.before,
      isCurrent: current,
      read: () =>
        publicClient.readContract({
          abi: erc20Abi,
          address: CARD_USDC,
          args: [pending.recipient],
          functionName: "balanceOf",
        }),
    });
    if (landed.status === "changed") {
      pendingPurchase.current = null;
      if (mounted.current) {
        setStatus("idle");
        toast.error("Wallet changed during card purchase", {
          description: "Check the original wallet for purchased USDC, then start again from the current account.",
        });
      }
      return;
    }
    if (landed.status === "delayed") {
      setStatus("delayed");
      toast.info(submitted ? "Card purchase submitted" : "Card purchase not yet visible", {
        description: "Base USDC has not arrived yet. Keep this account connected and check again after it appears.",
      });
      return;
    }

    pendingPurchase.current = null;
    void queryClient.invalidateQueries({
      queryKey: ["squid", "source-token-balances", pending.recipient, CARD_CHAIN_ID],
    });
    void queryClient.invalidateQueries({ queryKey: ["direct-squid-deposit-balances", CARD_CHAIN_ID] });
    setStatus("idle");
    onPurchased(landed.balance - pending.before);
  };

  const purchase = async (requested?: LoginContext) => {
    if (!publicClient) return;
    const intent = requested ?? { contextKey, recipient: getAddress(address) };

    setStatus("opening");
    try {
      if (!isCurrent(intent)) {
        if (mounted.current) setStatus("idle");
        return;
      }
      const before = await read(intent.recipient);
      if (before === undefined || !isCurrent(intent)) {
        if (mounted.current) setStatus("idle");
        return;
      }
      const result = await fund({
        source: {},
        destination: { address: intent.recipient, asset: CARD_USDC, chain: `eip155:${CARD_CHAIN_ID}` },
        environment: onrampEnvironment(),
      });
      if (!isCurrent(intent)) {
        setStatus("idle");
        toast.error("Wallet changed during card purchase", {
          description: "Check the original wallet for purchased USDC, then start again from the current account.",
        });
        return;
      }
      pendingPurchase.current = { before, ...intent };
      await checkPendingPurchase(result.status === "submitted");
    } catch (error) {
      if (!isFundingExit(error)) {
        toast.error("Card purchase failed", {
          description: error instanceof Error ? error.message : "Privy card funding is unavailable.",
        });
      }
      if (mounted.current) setStatus("idle");
    }
  };

  const { login } = useLogin({
    onComplete: () => {
      const intent = continueAfterLogin.current;
      continueAfterLogin.current = null;
      if (!intent) return;
      if (!isCurrent(intent)) {
        if (mounted.current) {
          setStatus("idle");
          toast.error("Wallet changed during login", {
            description: "Return to Add funds from the account you want to fund.",
          });
        }
        return;
      }
      void purchase(intent);
    },
    onError: () => {
      continueAfterLogin.current = null;
      if (mounted.current) setStatus("idle");
    },
  });

  const buyWithCard = () => {
    if (status === "opening" || status === "waiting") return;
    if (status === "delayed") return checkPendingPurchase();
    if (authenticated) return purchase();
    continueAfterLogin.current = { contextKey, recipient: getAddress(address) };
    setStatus("opening");
    login();
  };

  const startAnotherPurchase = () => {
    if (status !== "delayed") return;
    pendingPurchase.current = null;
    if (authenticated) return purchase();
    continueAfterLogin.current = { contextKey, recipient: getAddress(address) };
    setStatus("opening");
    login();
  };

  return {
    buyWithCard,
    isBusy: status === "opening" || status === "waiting",
    label:
      status === "delayed"
        ? "Check for purchased USDC"
        : authenticated
          ? "Buy USDC with card"
          : "Log in to buy USDC with card",
    startAnotherPurchase: status === "delayed" ? startAnotherPurchase : undefined,
    statusMessage:
      status === "opening"
        ? "Opening card purchase…"
        : status === "waiting"
          ? "Waiting for Base USDC to arrive…"
          : status === "delayed"
            ? "Purchase submitted, but Base USDC has not arrived yet. Check again after it appears."
            : null,
  };
}
