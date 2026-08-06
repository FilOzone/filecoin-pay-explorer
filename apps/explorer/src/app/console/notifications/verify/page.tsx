"use client";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { Card } from "@filecoin-pay/ui/components/card";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, Link2Off, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_NOTIFICATIONS_API_URL;

type VerifyState = "loading" | "success" | "not-found" | "error" | "missing-params";

async function callVerify(wallet: string, token: string): Promise<"success" | "not-found" | "error"> {
  if (!API_URL) return "error";
  try {
    const res = await fetch(
      `${API_URL}/verify?wallet=${encodeURIComponent(wallet)}&token=${encodeURIComponent(token)}`,
    );
    if (res.ok) return "success";
    if (res.status === 404) return "not-found";
    return "error";
  } catch {
    return "error";
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

  const [verifyState, setVerifyState] = useState<VerifyState>(isMissingParams ? "missing-params" : "loading");
  const [showDelayedMessage, setShowDelayedMessage] = useState(false);
  const processedRef = useRef<string | null>(null);

  const doVerify = useCallback(async () => {
    if (!wallet || !token) return;
    setVerifyState("loading");
    setShowDelayedMessage(false);
    const result = await callVerify(wallet, token);
    setVerifyState(result);
    if (result === "success") {
      queryClient.invalidateQueries({ queryKey: ["notification-status"] });
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
    if (verifyState !== "loading") return;
    const id = setTimeout(() => setShowDelayedMessage(true), 8_000);
    return () => clearTimeout(id);
  }, [verifyState]);

  return (
    <PageSection backgroundVariant='light'>
      <div aria-live='polite' aria-atomic='true'>
        <Card className='mx-auto w-full max-w-lg p-8 text-center'>
          {verifyState === "loading" && <VerifyLoadingContent showDelayedMessage={showDelayedMessage} />}

          {verifyState === "success" && (
            <div className='flex flex-col items-center gap-6'>
              <IconCircle color='green'>
                <CheckCircle2 className='h-8 w-8 text-green-500' />
              </IconCircle>
              <div className='flex flex-col gap-2'>
                <h1 className='text-2xl font-semibold'>Alerts are now on</h1>
                <p className='text-sm text-muted-foreground'>
                  Your email has been verified. We'll notify you when this account
                  <br />
                  may need additional funds.
                </p>
              </div>
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
            </div>
          )}

          {verifyState === "not-found" && (
            <div className='flex flex-col items-center gap-6'>
              <IconCircle color='amber'>
                <Clock className='h-8 w-8 text-amber-500' />
              </IconCircle>
              <div className='flex flex-col gap-2'>
                <h1 className='text-2xl font-semibold'>This verification link is no longer available</h1>
                <p className='text-sm text-muted-foreground'>
                  It may have expired or already been used. Return to alert settings
                  <br />
                  to request a new verification email.
                </p>
              </div>
              <Link
                href='/console/notifications'
                className='rounded-md border border-blue-600 px-6 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20'
              >
                Go to alert settings
              </Link>
            </div>
          )}

          {verifyState === "error" && (
            <div className='flex flex-col items-center gap-6'>
              <IconCircle color='red'>
                <AlertCircle className='h-8 w-8 text-red-500' />
              </IconCircle>
              <div className='flex flex-col gap-2'>
                <h1 className='text-2xl font-semibold'>We couldn't verify your email</h1>
                <p className='text-sm text-muted-foreground'>
                  Something went wrong while activating your alerts. Try again, or return to
                  <br />
                  alert settings to request a new verification email.
                </p>
              </div>
              <div className='flex items-center gap-3'>
                <button
                  type='button'
                  onClick={doVerify}
                  className='rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700'
                >
                  Try again
                </button>
                <Link
                  href='/console/notifications'
                  className='rounded-md border border-blue-600 px-6 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20'
                >
                  Alert settings
                </Link>
              </div>
            </div>
          )}

          {verifyState === "missing-params" && (
            <div className='flex flex-col items-center gap-6'>
              <IconCircle color='amber'>
                <Link2Off className='h-8 w-8 text-amber-500' />
              </IconCircle>
              <div className='flex flex-col gap-2'>
                <h1 className='text-2xl font-semibold'>This verification link is incomplete</h1>
                <p className='text-sm text-muted-foreground'>
                  We couldn't find the information needed to verify your email.
                  <br />
                  Return to alert settings to request a new verification email.
                </p>
              </div>
              <Link
                href='/console/notifications'
                className='rounded-md border border-blue-600 px-6 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20'
              >
                Go to alert settings
              </Link>
            </div>
          )}
        </Card>
      </div>
    </PageSection>
  );
};

const VerifyPage = () => (
  <Suspense
    fallback={
      <PageSection backgroundVariant='light'>
        <Card className='mx-auto w-full max-w-lg p-8 text-center'>
          <VerifyLoadingContent />
        </Card>
      </PageSection>
    }
  >
    <VerifyContent />
  </Suspense>
);

export default VerifyPage;
