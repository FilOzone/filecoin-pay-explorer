"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { useMutation } from "@tanstack/react-query";
import { Info, Loader2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { NotificationsCard } from "./NotificationsCard";

const CHECK_MESSAGES = {
  subscribed: null,
  pending: "Still pending — check back in a moment.",
  unavailable: "Could not check status. Try again later.",
} as const;

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

  useEffect(() => {
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resendAvailableAt]);

  // onCheckStatus is a status read (never throws); onResend can throw. Both are
  // one-shot imperative actions, so React Query owns their pending/result state.
  const checkMutation = useMutation({ mutationFn: () => onCheckStatus() });
  const resendMutation = useMutation({ mutationFn: () => onResend() });

  const checkMessage = checkMutation.data ? CHECK_MESSAGES[checkMutation.data] : null;
  const resendError = resendMutation.error
    ? resendMutation.error.message || "Failed to resend. Please try again."
    : null;

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
              <Button
                className='w-full'
                disabled={checkMutation.isPending}
                onClick={() => checkMutation.mutate()}
                type='button'
                variant='tertiary'
              >
                {checkMutation.isPending ? (
                  <span className='flex items-center justify-center gap-2'>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    Checking...
                  </span>
                ) : (
                  "Check verification status"
                )}
              </Button>
            )}

            {checkMessage && <p className='text-sm text-muted-foreground'>{checkMessage}</p>}

            <p className='text-sm text-muted-foreground'>
              Didn&apos;t receive it?{" "}
              {secondsLeft > 0 ? (
                <span>Resend email in {secondsLeft}s</span>
              ) : (
                <button
                  type='button'
                  onClick={() => resendMutation.mutate()}
                  disabled={resendMutation.isPending}
                  className='text-primary hover:underline disabled:opacity-50'
                >
                  {resendMutation.isPending ? "Resending..." : "Resend email"}
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
