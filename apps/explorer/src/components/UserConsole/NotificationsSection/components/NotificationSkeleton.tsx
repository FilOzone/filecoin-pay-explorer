"use client";
import { NotificationsCard } from "./NotificationsCard";

export const NotificationSkeleton = () => (
  <NotificationsCard>
    <div className='flex animate-pulse flex-col gap-4'>
      <div className='h-4 w-3/4 rounded bg-muted' />
      <div className='h-4 w-1/2 rounded bg-muted' />
      <div className='h-24 w-full rounded bg-muted' />
      <div className='h-4 w-2/3 rounded bg-muted' />
      <div className='h-4 w-5/6 rounded bg-muted' />
      <div className='h-10 w-full rounded bg-muted' />
    </div>
  </NotificationsCard>
);
