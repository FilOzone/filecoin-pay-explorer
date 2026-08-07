"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { useConnection, useSignMessage } from "wagmi";
import ConsoleProviders from "@/components/UserConsole/ConsoleProviders";
import {
  AlertsActiveCard,
  AlertsOffCard,
  AlertsUnsubscribingCard,
  NotificationSkeleton,
  NotificationsForm,
  type NotificationsFormValues,
  PendingVerificationCard,
  UnsubscribeDialog,
} from "@/components/UserConsole/NotificationsSection/components";
import { NotConnected } from "@/components/UserConsole/States";
import { getNetworkFromChainId, isNotificationsEligibleNetwork, isSupportedChainId } from "@/utils/network";

const API_URL = process.env.NEXT_PUBLIC_NOTIFICATIONS_API_URL;
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 3 * 60 * 1_000;
const RESEND_COOLDOWN_MS = 90_000;

function pendingKey(wallet: string) {
  return `notification-registration:${wallet.toLowerCase()}`;
}

interface PendingData {
  email: string;
  preferredName: string;
  resendAvailableAt: number;
}

function isPendingData(value: unknown): value is PendingData {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).email === "string" &&
    typeof (value as Record<string, unknown>).preferredName === "string" &&
    typeof (value as Record<string, unknown>).resendAvailableAt === "number"
  );
}

function readPending(wallet: string): PendingData | null {
  try {
    const raw = sessionStorage.getItem(pendingKey(wallet));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPendingData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writePending(wallet: string, data: PendingData): void {
  try {
    sessionStorage.setItem(pendingKey(wallet), JSON.stringify(data));
  } catch {}
}

function clearPending(wallet: string): void {
  try {
    sessionStorage.removeItem(pendingKey(wallet));
  } catch {}
}

type NotificationsView =
  | { type: "loading" }
  | { type: "status-error" }
  | { type: "not-subscribed"; initialName?: string; initialEmail?: string }
  | { type: "pending-verification"; email: string; preferredName: string; resendAvailableAt: number }
  | { type: "subscribed" }
  | { type: "unsubscribing"; cancellable: boolean }
  | { type: "unsubscribed-success" };

async function fetchStatus(walletAddress: string): Promise<boolean | null> {
  if (!API_URL) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${API_URL}/status?wallet=${walletAddress.toLowerCase()}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data: { subscribed: boolean } = await res.json();
    return data.subscribed === true;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function callRegister(body: {
  message: string;
  signature: string;
  email: string;
  preferredName: string;
}): Promise<void> {
  if (!API_URL) throw new Error("Notifications API URL not configured");
  const res = await fetch(`${API_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 429) throw new Error("Too many requests. Please wait a moment and try again.");
    if (res.status === 400 && data?.error) throw new Error(data.error);
    if (res.status === 401) throw new Error("Signature verification failed. Please try again.");
    throw new Error(data?.error ?? data?.message ?? "Registration failed. Please try again.");
  }
}

async function callUnsubscribe(body: { message: string; signature: string }): Promise<void> {
  if (!API_URL) throw new Error("Notifications API URL not configured");
  const res = await fetch(`${API_URL}/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Unsubscribe failed");
}

// Statements must match api/auth.ts SIWE_STATEMENTS exactly.
function buildSiweMessage(
  action: "register" | "unsubscribe",
  address: `0x${string}`,
  chainId: number,
  email?: string,
): string {
  const statement =
    action === "register"
      ? `Subscribe to Filecoin Pay notifications for ${email}`
      : "Unsubscribe from Filecoin Pay notifications";
  return createSiweMessage({
    domain: window.location.host,
    address,
    statement,
    uri: window.location.origin,
    version: "1",
    chainId,
    nonce: generateSiweNonce(),
    issuedAt: new Date(),
  });
}

function isUserRejection(err: unknown): boolean {
  return err instanceof Error && (err.message.includes("User rejected") || err.message.includes("user rejected"));
}

const MainnetOnly = () => (
  <EmptyStateCard
    titleTag='h2'
    icon={WarningCircleIcon}
    title='Mainnet Only'
    description='Notifications are only available on Filecoin Mainnet. Switch your wallet to Mainnet to subscribe to alerts.'
  />
);

const StatusUnavailable = ({ onRetry }: { onRetry: () => void }) => (
  <EmptyStateCard
    titleTag='h2'
    icon={WifiOff}
    title='Status unavailable'
    description='Could not check your alerts status. Check your connection and try again.'
  >
    <Button variant='primary' onClick={onRetry}>
      Try again
    </Button>
  </EmptyStateCard>
);

const NotificationsContent = ({ address, chainId }: { address: `0x${string}`; chainId: number }) => {
  const { mutateAsync: signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [view, setView] = useState<NotificationsView>({ type: "loading" });
  const [pollingActive, setPollingActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [unsubscribeDialogOpen, setUnsubscribeDialogOpen] = useState(false);
  const [unsubscribeError, setUnsubscribeError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const loadIdRef = useRef(0);

  const loadStatus = useCallback(async () => {
    const id = ++loadIdRef.current;
    setView({ type: "loading" });
    setSubmitError(null);
    const result = await fetchStatus(address);
    if (loadIdRef.current !== id) return;
    if (result === null) {
      setView({ type: "status-error" });
      return;
    }
    if (result) {
      clearPending(address);
      setView({ type: "subscribed" });
      return;
    }
    const pending = readPending(address);
    if (pending) {
      setView({ type: "pending-verification", ...pending });
      return;
    }
    setView({ type: "not-subscribed" });
  }, [address]);

  useEffect(() => {
    loadStatus();
    return () => {
      loadIdRef.current++;
    };
  }, [loadStatus]);

  useEffect(() => {
    if (view.type !== "pending-verification") return;
    setPollingActive(true);
    const start = Date.now();
    const id = setInterval(async () => {
      if (Date.now() - start > POLL_TIMEOUT_MS) {
        clearInterval(id);
        setPollingActive(false);
        return;
      }
      const subscribed = await fetchStatus(address);
      if (subscribed) {
        clearInterval(id);
        clearPending(address);
        queryClient.invalidateQueries({ queryKey: ["notification-status", address] });
        setView({ type: "subscribed" });
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [view.type, address, queryClient]);

  const handleRegister = useCallback(
    async (values: NotificationsFormValues) => {
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        const message = buildSiweMessage("register", address, chainId, values.email);
        const signature = await signMessageAsync({ message });
        await callRegister({ message, signature, email: values.email, preferredName: values.preferredName });
        const resendAvailableAt = Date.now() + RESEND_COOLDOWN_MS;
        const pending: PendingData = { email: values.email, preferredName: values.preferredName, resendAvailableAt };
        writePending(address, pending);
        setView({ type: "pending-verification", ...pending });
      } catch (err) {
        if (!isUserRejection(err)) {
          setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [address, chainId, signMessageAsync],
  );

  const handleCheckStatus = useCallback(async (): Promise<"subscribed" | "pending" | "unavailable"> => {
    const result = await fetchStatus(address);
    if (result === true) {
      clearPending(address);
      queryClient.invalidateQueries({ queryKey: ["notification-status", address] });
      setView({ type: "subscribed" });
      return "subscribed";
    }
    return result === null ? "unavailable" : "pending";
  }, [address, queryClient]);

  const handleResend = useCallback(async (): Promise<boolean> => {
    if (view.type !== "pending-verification") return false;
    try {
      const message = buildSiweMessage("register", address, chainId, view.email);
      const signature = await signMessageAsync({ message });
      await callRegister({ message, signature, email: view.email, preferredName: view.preferredName });
      const resendAvailableAt = Date.now() + RESEND_COOLDOWN_MS;
      const pending: PendingData = { email: view.email, preferredName: view.preferredName, resendAvailableAt };
      writePending(address, pending);
      setView({ type: "pending-verification", ...pending });
      return true;
    } catch (err) {
      if (isUserRejection(err)) return false;
      throw err;
    }
  }, [view, address, chainId, signMessageAsync]);

  const handleUseAnotherEmail = useCallback(() => {
    const initialName = view.type === "pending-verification" ? view.preferredName : undefined;
    const initialEmail = view.type === "pending-verification" ? view.email : undefined;
    clearPending(address);
    setView({ type: "not-subscribed", initialName, initialEmail });
  }, [view, address]);

  const handleTurnOffClick = useCallback(() => {
    setUnsubscribeError(null);
    setUnsubscribeDialogOpen(true);
  }, []);

  const handleConfirmUnsubscribe = useCallback(async () => {
    setUnsubscribeDialogOpen(false);
    cancelledRef.current = false;
    setView({ type: "unsubscribing", cancellable: true });
    try {
      const message = buildSiweMessage("unsubscribe", address, chainId);
      const signature = await signMessageAsync({ message });
      if (cancelledRef.current) return;
      setView({ type: "unsubscribing", cancellable: false });
      await callUnsubscribe({ message, signature });
      if (!cancelledRef.current) {
        clearPending(address);
        queryClient.invalidateQueries({ queryKey: ["notification-status", address] });
        setView({ type: "unsubscribed-success" });
      }
    } catch (err) {
      if (!cancelledRef.current) {
        if (!isUserRejection(err)) {
          setUnsubscribeError(err instanceof Error ? err.message : "Failed to turn off alerts. Please try again.");
        }
        setView({ type: "subscribed" });
      }
    }
  }, [address, chainId, signMessageAsync, queryClient]);

  const handleCancelUnsubscribing = useCallback(() => {
    cancelledRef.current = true;
    setView({ type: "subscribed" });
  }, []);

  const handleEnableAgain = useCallback(() => {
    setSubmitError(null);
    setView({ type: "not-subscribed" });
  }, []);

  const handleRetryStatus = useCallback(() => {
    loadStatus();
  }, [loadStatus]);

  switch (view.type) {
    case "loading":
      return <NotificationSkeleton />;

    case "status-error":
      return <StatusUnavailable onRetry={handleRetryStatus} />;

    case "not-subscribed":
      return (
        <NotificationsForm
          isSubmitting={isSubmitting}
          submitError={submitError}
          initialValues={{ preferredName: view.initialName, email: view.initialEmail }}
          onSubmit={handleRegister}
        />
      );

    case "pending-verification":
      return (
        <PendingVerificationCard
          email={view.email}
          resendAvailableAt={view.resendAvailableAt}
          isPollingActive={pollingActive}
          onCheckStatus={handleCheckStatus}
          onResend={handleResend}
          onUseAnotherEmail={handleUseAnotherEmail}
        />
      );

    case "subscribed":
      return (
        <>
          <AlertsActiveCard onTurnOff={handleTurnOffClick} error={unsubscribeError} />
          <UnsubscribeDialog
            open={unsubscribeDialogOpen}
            onCancel={() => setUnsubscribeDialogOpen(false)}
            onConfirm={handleConfirmUnsubscribe}
          />
        </>
      );

    case "unsubscribing":
      return <AlertsUnsubscribingCard onCancel={view.cancellable ? handleCancelUnsubscribing : undefined} />;

    case "unsubscribed-success":
      return <AlertsOffCard onEnableAgain={handleEnableAgain} />;
  }
};

const NotificationsMain = () => {
  const { address, isConnected, chainId } = useConnection();
  const walletNetwork = useMemo(() => getNetworkFromChainId(chainId), [chainId]);
  const isEligibleNetwork = isSupportedChainId(chainId) && isNotificationsEligibleNetwork(walletNetwork);

  return (
    <PageSection backgroundVariant='light'>
      <div className='flex flex-col gap-15 -mt-25 sm:mt-0'>
        <div>
          <Link
            href='/console'
            className='inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6'
          >
            <ArrowLeft className='h-4 w-4' />
            Back to console
          </Link>
          <h2 className='font-heading text-balance text-3xl/10 font-medium sm:text-5xl/15 sm:tracking-tight'>
            Email alerts
          </h2>
          <p className='mt-2 text-muted-foreground'>
            Receive alerts when your account has less than 30 days of service runway remaining, so you can top up before
            services are affected.
          </p>
        </div>

        <div>
          {(!isConnected || !address) && <NotConnected />}
          {isConnected && address && !isEligibleNetwork && <MainnetOnly />}
          {isConnected && address && chainId !== undefined && isEligibleNetwork && (
            <NotificationsContent address={address} chainId={chainId} />
          )}
        </div>
      </div>
    </PageSection>
  );
};

const NotificationsPage = () => (
  <ConsoleProviders>
    <NotificationsMain />
  </ConsoleProviders>
);

export default NotificationsPage;
