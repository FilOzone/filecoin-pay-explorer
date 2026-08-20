"use client";
import { Container } from "@filecoin-foundation/ui-filecoin/Container";
import { Card } from "@filecoin-pay/ui/components/card";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, Link2Off, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ConsoleHeader } from "@/components/UserConsole/ConsoleHeader";

const API_URL = process.env.NEXT_PUBLIC_NOTIFICATIONS_API_URL;

type VerifyResult =
  | { ok: true }
  | { ok: false; kind: "not-found" | "rate-limited" | "network" | "server" | "unconfigured"; detail: string };

type VerifyState =
  | { type: "loading" }
  | { type: "success" }
  | { type: "not-found" }
  | { type: "missing-params" }
  | { type: "rate-limited" }
  | { type: "error"; kind: "network" | "server" | "unconfigured"; detail: string };

async function callVerify(wallet: string, token: string): Promise<VerifyResult> {
  if (!API_URL) {
    console.error("callVerify: NEXT_PUBLIC_NOTIFICATIONS_API_URL is not configured");
    return { ok: false, kind: "unconfigured", detail: "Service not configured" };
  }
  try {
    const res = await fetch(
      `${API_URL}/verify?wallet=${encodeURIComponent(wallet)}&token=${encodeURIComponent(token)}`,
    );
    if (res.ok) return { ok: true };
    if (res.status === 404) return { ok: false, kind: "not-found", detail: "404 Not Found" };
    if (res.status === 429) {
      console.error("callVerify: rate limited (429)");
      return { ok: false, kind: "rate-limited", detail: "429 Too Many Requests" };
    }
    const detail = `HTTP ${res.status}`;
    console.error(`callVerify: unexpected response ${detail}`);
    return { ok: false, kind: "server", detail };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Network error";
    console.error("callVerify: network error", err);
    return { ok: false, kind: "network", detail };
  }
}

const IconCircle = ({ children, color }: { children: ReactNode; color: "blue" | "green" | "amber" | "red" }) => {
  const bg = {
    blue: "bg-blue-100 dark:bg-blue-900/30",
    green: "bg-green-100 dark:bg-green-900/30",
    amber: "bg-amber-100 dark:bg-amber-900/30",
    red: "bg-red-100 dark:bg-red-900/30",
  }[color];
  return <div className={`flex h-16 w-16 items-center justify-center rounded-full ${bg}`}>{children}</div>;
};

const VerifyResultCard = ({
  icon,
  color,
  title,
  description,
  detail,
  actions,
}: {
  icon: ReactNode;
  color: "blue" | "green" | "amber" | "red";
  title: string;
  description: string;
  detail?: string;
  actions: ReactNode;
}) => (
  <div className='flex flex-col items-center gap-6'>
    <IconCircle color={color}>{icon}</IconCircle>
    <div className='flex flex-col gap-2'>
      <h1 className='text-2xl font-semibold'>{title}</h1>
      <p className='text-sm text-muted-foreground'>{description}</p>
      {detail && <p className='mt-1 font-mono text-xs text-muted-foreground'>{detail}</p>}
    </div>
    {actions}
  </div>
);

const AlertSettingsLink = ({ label = "Go to alert settings" }: { label?: string }) => (
  <Link
    href='/console/notifications'
    className='rounded-md border border-blue-600 px-6 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20'
  >
    {label}
  </Link>
);

const VerifyLoadingContent = ({ showDelayedMessage = false }: { showDelayedMessage?: boolean }) => (
  <div className='flex flex-col items-center gap-6'>
    <IconCircle color='blue'>
      <Loader2 className='h-8 w-8 animate-spin text-blue-500' />
    </IconCircle>
    <div className='flex flex-col gap-2'>
      <h1 className='text-2xl font-semibold'>Verifying your email</h1>
      <p className='text-sm text-muted-foreground'>
        We&apos;re activating alerts for this Filecoin Pay account.
        <br />
        This should only take a moment.
      </p>
      {showDelayedMessage && (
        <p className='mt-2 text-sm text-muted-foreground'>
          This is taking longer than expected. Please keep this page open.
        </p>
      )}
    </div>
  </div>
);

const VerifyContent = () => {
  const searchParams = useSearchParams();
  const wallet = searchParams.get("wallet");
  const token = searchParams.get("token");
  const isMissingParams = !wallet || !token;
  const queryClient = useQueryClient();

  const [verifyState, setVerifyState] = useState<VerifyState>(
    isMissingParams ? { type: "missing-params" } : { type: "loading" },
  );
  const [showDelayedMessage, setShowDelayedMessage] = useState(false);
  const processedRef = useRef<string | null>(null);

  const doVerify = useCallback(async () => {
    if (!wallet || !token) return;
    setVerifyState({ type: "loading" });
    setShowDelayedMessage(false);
    const result = await callVerify(wallet, token);
    if (result.ok) {
      setVerifyState({ type: "success" });
      queryClient.invalidateQueries({ queryKey: ["notification-status"] });
    } else if (result.kind === "not-found") {
      setVerifyState({ type: "not-found" });
    } else if (result.kind === "rate-limited") {
      setVerifyState({ type: "rate-limited" });
    } else {
      setVerifyState({ type: "error", kind: result.kind, detail: result.detail });
    }
  }, [wallet, token, queryClient]);

  useEffect(() => {
    if (!wallet || !token) return;
    const key = `${wallet}:${token}`;
    if (processedRef.current === key) return;
    processedRef.current = key;
    doVerify();
  }, [doVerify, wallet, token]);

  useEffect(() => {
    if (verifyState.type !== "loading") return;
    const id = setTimeout(() => setShowDelayedMessage(true), 8_000);
    return () => clearTimeout(id);
  }, [verifyState.type]);

  return (
    <div aria-live='polite' aria-atomic='true'>
      <Card className='mx-auto w-full max-w-lg p-8 text-center'>
        {verifyState.type === "loading" && <VerifyLoadingContent showDelayedMessage={showDelayedMessage} />}

        {verifyState.type === "success" && (
          <VerifyResultCard
            icon={<CheckCircle2 className='h-8 w-8 text-green-500' />}
            color='green'
            title='Alerts are now on'
            description="Your email has been verified. We'll notify you when this account has less than 30 days of service runway remaining."
            actions={
              <div className='flex w-full flex-col items-center gap-3'>
                <Link
                  href='/console'
                  className='w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700'
                >
                  Back to Console
                </Link>
                <Link href='/console/notifications' className='text-sm text-primary hover:underline'>
                  Manage alerts
                </Link>
              </div>
            }
          />
        )}

        {verifyState.type === "not-found" && (
          <VerifyResultCard
            icon={<Clock className='h-8 w-8 text-amber-500' />}
            color='amber'
            title='This verification link is no longer available'
            description='It may have expired or already been used. Return to alert settings to request a new verification email.'
            actions={<AlertSettingsLink />}
          />
        )}

        {verifyState.type === "rate-limited" && (
          <VerifyResultCard
            icon={<Clock className='h-8 w-8 text-amber-500' />}
            color='amber'
            title='Too many attempts'
            description='Please wait a few minutes before trying again, then return to alert settings to request a new verification email.'
            actions={<AlertSettingsLink />}
          />
        )}

        {verifyState.type === "error" && (
          <VerifyResultCard
            icon={<AlertCircle className='h-8 w-8 text-red-500' />}
            color='red'
            title="We couldn't verify your email"
            description={
              verifyState.kind === "network"
                ? "Check your internet connection and try again."
                : "Something went wrong on our end. Try again in a moment, or return to alert settings to request a new verification email."
            }
            detail={verifyState.detail}
            actions={
              <div className='flex items-center gap-3'>
                <button
                  type='button'
                  onClick={doVerify}
                  className='rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700'
                >
                  Try again
                </button>
                <AlertSettingsLink label='Alert settings' />
              </div>
            }
          />
        )}

        {verifyState.type === "missing-params" && (
          <VerifyResultCard
            icon={<Link2Off className='h-8 w-8 text-amber-500' />}
            color='amber'
            title='This verification link is incomplete'
            description="We couldn't find the information needed to verify your email. Return to alert settings to request a new verification email."
            actions={<AlertSettingsLink />}
          />
        )}
      </Card>
    </div>
  );
};

const VerifyPage = () => (
  <div className='flex min-h-screen flex-col bg-background text-foreground'>
    <ConsoleHeader />

    <div className='flex-1 py-12'>
      <Container>
        <Suspense
          fallback={
            <Card className='mx-auto w-full max-w-lg p-8 text-center'>
              <VerifyLoadingContent />
            </Card>
          }
        >
          <VerifyContent />
        </Suspense>
      </Container>
    </div>
  </div>
);

export default VerifyPage;
