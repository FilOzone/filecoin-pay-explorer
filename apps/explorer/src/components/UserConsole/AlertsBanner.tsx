"use client";

import { InternalTextLink } from "@filecoin-foundation/ui-filecoin/TextLink/InternalTextLink";
import { Bell } from "lucide-react";

/** One line under the funds overview until email alerts are on. */
export const AlertsBanner = () => (
  <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm'>
    <span className='inline-flex items-center gap-2'>
      <Bell aria-hidden className='h-4 w-4 text-muted-foreground' />
      Get an email before your balance runs out.
    </span>
    <InternalTextLink href='/console/notifications'>Enable alerts</InternalTextLink>
  </div>
);
