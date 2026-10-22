"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, WifiOff } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useSignMessage } from "wagmi";
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
import { useConsoleNetwork } from "@/components/UserConsole/useConsoleNetwork";
import { useNotificationStatus } from "@/hooks/useNotificationStatus";
import { buildNotificationsSiwe, NOTIFICATIONS_API_URL, postNotificationsApi } from "@/services/notifications";
import { getNotificationsEligibleNetwork, isNotificationsEligibleNetwork } from "@/utils/network";
import { isUserRejection } from "@/utils/wallet-errors";

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
  | { type: "not-subscribed"; initialName?: string; initialEmail?: string; onCancel?: () => void }
  | { type: "pending-verification"; email: string; preferredName: string; resendAvailableAt: number }
  | { type: "subscribed" }
  | { type: "unsubscribing"; cancellable: boolean }
  | { type: "unsubscribed-success" };

// Local, in-flight states that the shared /status query cannot tell us about.
// When an overlay is set it takes precedence over the query-derived baseline.
type Overlay =
  | { type: "not-subscribed"; initialName?: string; initialEmail?: string; onCancel?: () => void }
  | { type: "pending-verification"; email: string; preferredName: string; resendAvailableAt: number }
  | { type: "unsubscribing"; cancellable: boolean }
  | { type: "unsubscribed-success" };

// Baseline view derived purely from the shared /status query.
function deriveBaseView(status: ReturnType<typeof useNotificationStatus>): NotificationsView {
  if (!NOTIFICATIONS_API_URL) return { type: "status-error" };
  if (status.isPending) return { type: "loading" };
  if (status.isError) return { type: "status-error" };
  if (status.data?.subscribed) return { type: "subscribed" };
  return { type: "not-subscribed" };
}

const eligibleNetwork = getNotificationsEligibleNetwork();
const ELIGIBLE_NETWORK_LABEL = eligibleNetwork.charAt(0).toUpperCase() + eligibleNetwork.slice(1);

const IneligibleNetwork = () => (
  <EmptyStateCard
    titleTag='h2'
    icon={WarningCircleIcon}
    title='Network not supported'
    description={`Notifications are only available on Filecoin ${ELIGIBLE_NETWORK_LABEL}. Switch your wallet to subscribe to alerts.`}
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

const NotificationsContent = ({
  address,
  chainId,
  onViewChange,
  updateEmailRef,
}: {
  address: `0x${string}`;
  chainId: number;
  onViewChange?: (type: NotificationsView["type"]) => void;
  updateEmailRef?: React.RefObject<(() => void) | null>;
}) => {
  const { mutateAsync: signMessageAsync } = useSignMessage();
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  const [unsubscribeDialogOpen, setUnsubscribeDialogOpen] = useState(false);
  const [unsubscribeError, setUnsubscribeError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const initedRef = useRef(false);

  // Poll the shared /status query only while awaiting verification.
  const isPolling = overlay?.type === "pending-verification" && pollingActive;
  const status = useNotificationStatus(address, { refetchInterval: isPolling ? POLL_INTERVAL_MS : false });
  const subscribed = status.data?.subscribed === true;

  // An active local flow wins; otherwise fall through to the query-derived view.
  const view: NotificationsView = overlay ?? deriveBaseView(status);

  // Sign + register, then enter the pending-verification flow. Shared by the
  // initial submit (via the mutation below) and the resend action.
  const register = useCallback(
    async (email: string, preferredName: string) => {
      const message = buildNotificationsSiwe(address, chainId, `Subscribe to Filecoin Pay notifications for ${email}`);
      const signature = await signMessageAsync({ message });
      await postNotificationsApi(
        "/register",
        { message, signature, email, preferredName },
        "Registration failed. Please try again.",
      );
      const pending: PendingData = { email, preferredName, resendAvailableAt: Date.now() + RESEND_COOLDOWN_MS };
      writePending(address, pending);
      setOverlay({ type: "pending-verification", ...pending });
    },
    [address, chainId, signMessageAsync],
  );

  // The form submit is a one-shot write; React Query owns its pending/error state.
  // Resend does NOT go through here (see handleResend) so its failures stay out of submitError.
  const registerMutation = useMutation({
    mutationFn: ({ email, preferredName }: NotificationsFormValues) => register(email, preferredName),
  });
  const submitError =
    registerMutation.error && !isUserRejection(registerMutation.error)
      ? registerMutation.error.message || "Something went wrong. Please try again."
      : null;

  // First non-pending status for this wallet: resume the "check your email" flow
  // if a prior registration is still stored and we're not already subscribed.
  useEffect(() => {
    if (initedRef.current || status.isPending) return;
    initedRef.current = true;
    if (!subscribed) {
      const pending = readPending(address);
      if (pending) setOverlay({ type: "pending-verification", ...pending });
    }
  }, [status.isPending, subscribed, address]);

  // Server confirms subscribed (initial load or a successful poll): drop the
  // pending overlay so `view` falls through to "subscribed".
  useEffect(() => {
    if (!subscribed) return;
    clearPending(address);
    setOverlay((current) => (current?.type === "pending-verification" ? null : current));
  }, [subscribed, address]);

  // Each submit/resend opens a fresh POLL_TIMEOUT_MS window to auto-check for
  // verification. Keyed on resendAvailableAt (which changes on every resend), so a
  // resend restarts polling — including after a prior window has already expired.
  const pendingResendKey = overlay?.type === "pending-verification" ? overlay.resendAvailableAt : null;
  useEffect(() => {
    if (pendingResendKey === null) {
      setPollingActive(false);
      return;
    }
    setPollingActive(true);
    const id = setTimeout(() => setPollingActive(false), POLL_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [pendingResendKey]);

  // Keep the heading's "Update email" button in sync with the current view.
  useEffect(() => {
    onViewChange?.(view.type);
  }, [view.type, onViewChange]);

  useEffect(() => {
    if (!updateEmailRef) return;
    updateEmailRef.current = () => {
      clearPending(address);
      registerMutation.reset(); // drop any stale error from a prior update-email attempt
      // Cancelling clears the overlay → view derives back to "subscribed".
      setOverlay({ type: "not-subscribed", onCancel: () => setOverlay(null) });
    };
  }, [updateEmailRef, address, registerMutation.reset]);

  const handleCheckStatus = useCallback(async (): Promise<"subscribed" | "pending" | "unavailable"> => {
    const { data, isError } = await status.refetch();
    if (data?.subscribed) return "subscribed"; // the subscribed effect clears the overlay
    return isError ? "unavailable" : "pending";
  }, [status.refetch]);

  const handleResend = useCallback(async (): Promise<boolean> => {
    if (overlay?.type !== "pending-verification") return false;
    try {
      await register(overlay.email, overlay.preferredName);
      return true;
    } catch (err) {
      if (isUserRejection(err)) return false;
      throw err;
    }
  }, [overlay, register]);

  const handleUseAnotherEmail = useCallback(() => {
    const seed = overlay?.type === "pending-verification" ? overlay : undefined;
    clearPending(address);
    setOverlay({ type: "not-subscribed", initialName: seed?.preferredName, initialEmail: seed?.email });
  }, [overlay, address]);

  const handleTurnOffClick = useCallback(() => {
    setUnsubscribeError(null);
    setUnsubscribeDialogOpen(true);
  }, []);

  const handleConfirmUnsubscribe = useCallback(async () => {
    setUnsubscribeDialogOpen(false);
    cancelledRef.current = false;
    setOverlay({ type: "unsubscribing", cancellable: true });
    try {
      const message = buildNotificationsSiwe(address, chainId, "Unsubscribe from Filecoin Pay notifications");
      const signature = await signMessageAsync({ message });
      if (cancelledRef.current) return;
      setOverlay({ type: "unsubscribing", cancellable: false });
      await postNotificationsApi(
        "/unsubscribe",
        { message, signature },
        "Failed to turn off alerts. Please try again.",
      );
      if (!cancelledRef.current) {
        clearPending(address);
        setOverlay({ type: "unsubscribed-success" });
        void status.refetch(); // sync the shared cache so the console banner updates too
      }
    } catch (err) {
      if (!cancelledRef.current) {
        if (!isUserRejection(err)) {
          setUnsubscribeError(err instanceof Error ? err.message : "Failed to turn off alerts. Please try again.");
        }
        setOverlay(null); // back to subscribed
      }
    }
  }, [address, chainId, signMessageAsync, status.refetch]);

  const handleCancelUnsubscribing = useCallback(() => {
    cancelledRef.current = true;
    setOverlay(null);
  }, []);

  const handleEnableAgain = useCallback(() => {
    registerMutation.reset();
    setOverlay({ type: "not-subscribed" });
  }, [registerMutation.reset]);

  const handleRetryStatus = useCallback(() => {
    void status.refetch();
  }, [status.refetch]);

  switch (view.type) {
    case "loading":
      return <NotificationSkeleton />;

    case "status-error":
      return <StatusUnavailable onRetry={handleRetryStatus} />;

    case "not-subscribed":
      return (
        <NotificationsForm
          isSubmitting={registerMutation.isPending}
          submitError={submitError}
          initialValues={{ preferredName: view.initialName, email: view.initialEmail }}
          onSubmit={(values) => registerMutation.mutate(values)}
          onCancel={view.onCancel}
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

const NotificationsPage = () => {
  const { address, isConnected, chainId } = useConnection();
  const { network, isFilecoinChain } = useConsoleNetwork();
  const isEligibleNetwork = isFilecoinChain && isNotificationsEligibleNetwork(network);
  const [viewType, setViewType] = useState<NotificationsView["type"]>("loading");
  const updateEmailRef = useRef<(() => void) | null>(null);

  const showUpdateEmail = viewType === "subscribed" && isConnected && !!address && isEligibleNetwork;

  function renderContent() {
    // Connection gating lives in the console layout; by here the wallet is connected.
    if (!address || chainId === undefined) return null;
    if (!isEligibleNetwork) return <IneligibleNetwork />;
    return (
      <NotificationsContent
        key={address}
        address={address}
        chainId={chainId}
        onViewChange={setViewType}
        updateEmailRef={updateEmailRef}
      />
    );
  }

  return (
    <div className='flex flex-col gap-15'>
      <div>
        <div className='flex items-baseline justify-between'>
          <h2 className='font-heading text-balance text-3xl/10 font-medium sm:text-5xl/15 sm:tracking-tight'>
            Email alerts
          </h2>
          {showUpdateEmail ? (
            <button
              type='button'
              onClick={() => updateEmailRef.current?.()}
              className='inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline'
            >
              Update email
              <ChevronRight className='h-4 w-4' />
            </button>
          ) : null}
        </div>
        <p className='mt-2 text-muted-foreground'>
          Receive alerts when your account has less than 30 days of service runway remaining, so you can top up before
          services are affected.
        </p>
      </div>

      <div>{renderContent()}</div>
    </div>
  );
};

export default NotificationsPage;
