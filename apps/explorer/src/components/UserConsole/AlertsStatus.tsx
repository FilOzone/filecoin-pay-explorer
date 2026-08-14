"use client";
import { Bell, BellOff, Settings } from "lucide-react";
import Link from "next/link";

interface AlertsStatusProps {
  subscribed: boolean;
}

export const AlertsStatus = ({ subscribed }: AlertsStatusProps) => {
  if (subscribed) {
    return (
      <Link
        href='/console/notifications'
        className='flex items-center gap-2 text-sm text-green-500 hover:opacity-80 transition-opacity'
      >
        <Bell className='h-4 w-4' />
        <span className='font-medium'>Alerts on</span>
        <Settings className='h-4 w-4 text-muted-foreground' />
      </Link>
    );
  }

  return (
    <Link
      href='/console/notifications'
      className='flex items-center gap-2 text-sm text-muted-foreground hover:opacity-80 transition-opacity'
    >
      <BellOff className='h-4 w-4' />
      <span>Alerts off</span>
    </Link>
  );
};
