"use client";

import { Hourglass } from "lucide-react";
import Link from "next/link";
import { useConnection } from "wagmi";
import { useAccountRunway } from "@/hooks/useAccountRunway";
import { getNetworkFromChainId } from "@/utils/network";

const formatDate = (date: Date): string =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * Slim account-level pointer, deliberately not a metric card: runway belongs to
 * the account (funds are shared across services), so the service page only
 * points at it and links to the Dashboard where the money lives.
 */
export const RunwayBanner = () => {
  const { address, chainId } = useConnection();
  const network = getNetworkFromChainId(chainId);
  const runway = useAccountRunway(address?.toLowerCase(), network);

  if (!runway) return null;

  return (
    <div className='flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground'>
      <Hourglass className='size-4' />
      <span>
        Account runway <span className='font-medium text-foreground'>~{runway.days} days</span> · covers current spend
        until {formatDate(runway.coveredUntil)} · shared across services
      </span>
      <Link href='/console' className='ml-auto font-medium text-primary hover:underline'>
        Dashboard →
      </Link>
    </div>
  );
};
