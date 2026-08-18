"use client";
import { KeyRound, Loader2 } from "lucide-react";
import { NotificationsCard } from "./NotificationsCard";

interface AlertsUnsubscribingCardProps {
  onCancel?: () => void;
}

export const AlertsUnsubscribingCard = ({ onCancel }: AlertsUnsubscribingCardProps) => (
  <NotificationsCard>
    <div className='flex flex-col items-center gap-4 text-center'>
      <div className='flex h-16 w-16 items-center justify-center rounded-full bg-primary/10'>
        <KeyRound className='h-8 w-8 text-primary' />
      </div>
      <h3 className='text-xl font-semibold'>{onCancel ? "Confirm in your wallet" : "Turning off alerts"}</h3>
      <p className='text-sm text-muted-foreground'>
        {onCancel
          ? "Please sign the message in your wallet to turn off email alerts for this account."
          : "Almost done. This will only take a moment."}
      </p>
      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
        <Loader2 className='h-4 w-4 animate-spin' />
        {onCancel ? "Waiting for signature..." : "Removing subscription..."}
      </div>
      {onCancel && (
        <button type='button' onClick={onCancel} className='text-sm text-primary hover:underline'>
          Cancel
        </button>
      )}
    </div>
  </NotificationsCard>
);
