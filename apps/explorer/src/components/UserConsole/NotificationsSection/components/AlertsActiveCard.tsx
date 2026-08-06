"use client";
import { CheckCircle2 } from "lucide-react";
import { NotificationsCard } from "./NotificationsCard";

interface AlertsActiveCardProps {
  onTurnOff: () => void;
  error?: string | null;
}

export const AlertsActiveCard = ({ onTurnOff, error }: AlertsActiveCardProps) => (
  <NotificationsCard>
    <div className='flex flex-col items-center gap-4 text-center'>
      <div className='flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30'>
        <CheckCircle2 className='h-8 w-8 text-green-500' />
      </div>
      <h3 className='text-xl font-semibold'>Alerts are on</h3>
      <p className='text-sm text-muted-foreground'>
        This wallet will receive email alerts when the account may need additional funds.
      </p>
      {error && <p className='text-sm text-destructive'>{error}</p>}
      <button type='button' onClick={onTurnOff} className='cursor-pointer text-sm text-destructive hover:underline'>
        Turn off alerts
      </button>
    </div>
  </NotificationsCard>
);
