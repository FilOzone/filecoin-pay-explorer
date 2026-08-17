"use client";
import { Card } from "@filecoin-pay/ui/components/card";
import { ArrowRight, Bell } from "lucide-react";
import Link from "next/link";

export const AlertsBanner = () => (
  <Card className='p-6 bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900'>
    <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6'>
      <div className='flex items-center gap-4 sm:contents'>
        <div className='flex-shrink-0 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center'>
          <Bell className='h-7 w-7 text-primary' />
        </div>

        <div className='flex-1'>
          <p className='font-semibold text-lg'>Stay ahead of low balances</p>
          <p className='text-muted-foreground text-sm mt-1'>
            Receive alerts when your account has less than 30 days of service runway remaining.
          </p>
        </div>
      </div>

      <Link
        href='/console/notifications'
        className='inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors sm:whitespace-nowrap'
      >
        Enable alerts
        <ArrowRight className='h-4 w-4' />
      </Link>
    </div>
  </Card>
);
