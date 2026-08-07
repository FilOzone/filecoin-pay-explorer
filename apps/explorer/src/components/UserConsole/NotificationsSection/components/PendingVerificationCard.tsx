"use client";
import { Info, Loader2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { NotificationsCard } from "./NotificationsCard";

interface PendingVerificationCardProps {
  email: string;
  resendAvailableAt: number;
  isPollingActive: boolean;
  onCheckStatus: () => Promise<"subscribed" | "pending" | "unavailable">;
  onResend: () => Promise<boolean>;
  onUseAnotherEmail: () => void;
}

export const PendingVerificationCard = ({
  email,
  resendAvailableAt,
  isPollingActive,
  onCheckStatus,
  onResend,
  onUseAnotherEmail,
}: PendingVerificationCardProps) => {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000)));
  const [isChecking, setIsChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resendAvailableAt]);

  const handleCheckStatus = async () => {
    setIsChecking(true);
    setCheckMessage(null);
    try {
      const result = await onCheckStatus();
      if (result === "pending") setCheckMessage("Still pending — check back in a moment.");
      if (result === "unavailable") setCheckMessage("Could not check status. Try again later.");
    } finally {
      setIsChecking(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setResendError(null);
    try {
      await onResend();
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Failed to resend. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className='mx-auto flex max-w-md flex-col gap-3'>
      <NotificationsCard>
        <div className='flex flex-col items-center gap-6 text-center'>
          <div className='flex h-16 w-16 items-center justify-center rounded-full bg-primary/10'>
            <Mail className='h-8 w-8 text-primary' />
          </div>

          <div className='flex flex-col gap-2'>
            <h3 className='text-xl font-semibold'>Check your email</h3>
            <p className='text-sm text-muted-foreground'>We sent a verification link to:</p>
            <p className='font-semibold'>{email}</p>
            <p className='text-sm text-muted-foreground'>
              {isPollingActive
                ? "This page will update automatically. Check your inbox and click the link."
                : "Open the link in the email to activate alerts for this wallet."}
            </p>
          </div>

          <div className='flex w-full flex-col gap-3'>
            {secondsLeft === 0 && (
              <button
                type='button'
                onClick={handleCheckStatus}
                disabled={isChecking}
                className='w-full rounded-md border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-950/20'
              >
                {isChecking ? (
                  <span className='flex items-center justify-center gap-2'>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    Checking...
                  </span>
                ) : (
                  "Check verification status"
                )}
              </button>
            )}

            {checkMessage && <p className='text-sm text-muted-foreground'>{checkMessage}</p>}

            <p className='text-sm text-muted-foreground'>
              Didn&apos;t receive it?{" "}
              {secondsLeft > 0 ? (
                <span>Resend email in {secondsLeft}s</span>
              ) : (
                <button
                  type='button'
                  onClick={handleResend}
                  disabled={isResending}
                  className='text-primary hover:underline disabled:opacity-50'
                >
                  {isResending ? "Resending..." : "Resend email"}
                </button>
              )}
            </p>

            {resendError && <p className='text-sm text-destructive'>{resendError}</p>}

            <button type='button' onClick={onUseAnotherEmail} className='text-sm text-primary hover:underline'>
              Use a different email
            </button>
          </div>
        </div>
      </NotificationsCard>

      <div className='flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground'>
        <Info className='h-4 w-4 flex-shrink-0' />
        The link will expire in 24 hours.
      </div>
    </div>
  );
};
