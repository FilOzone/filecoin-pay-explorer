"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { BellOff } from "lucide-react";
import { NotificationsCard } from "./NotificationsCard";

interface AlertsOffCardProps {
  onEnableAgain: () => void;
}

export const AlertsOffCard = ({ onEnableAgain }: AlertsOffCardProps) => (
  <NotificationsCard>
    <div className='flex flex-col items-center gap-4 text-center'>
      <div className='flex h-16 w-16 items-center justify-center rounded-full bg-muted'>
        <BellOff className='h-8 w-8 text-muted-foreground' />
      </div>
      <h3 className='text-xl font-semibold'>Alerts turned off</h3>
      <p className='text-sm text-muted-foreground'>This wallet is no longer subscribed to email alerts.</p>
      <Button variant='primary' onClick={onEnableAgain}>
        Enable alerts again
      </Button>
    </div>
  </NotificationsCard>
);
