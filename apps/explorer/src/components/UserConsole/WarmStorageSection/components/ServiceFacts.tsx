"use client";

import { Hourglass, KeyRound, Tag } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Hex } from "viem";
import { useConnection } from "wagmi";
import { useAccountRunway } from "@/hooks/useAccountRunway";
import { useServicePricing } from "@/hooks/useServicePricing";
import { useSessionKeys } from "@/hooks/useSessionKeys";
import { formatTokenTruncated } from "@/utils/formatter";
import { getNetworkFromChainId } from "@/utils/network";

/** USDFC decimals; getServicePrice() prices are denominated in the service token. */
const TOKEN_DECIMALS = 18;

const formatDate = (date: Date): string =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const FactRow = ({
  icon,
  label,
  children,
  action,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) => (
  <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5'>
    <span className='flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
      {icon}
      {label}
    </span>
    <span className='min-w-0 flex-1 text-sm text-muted-foreground'>{children}</span>
    {action ? <span className='shrink-0 text-sm'>{action}</span> : null}
  </div>
);

const Value = ({ children }: { children: ReactNode }) => (
  <span className='font-medium tabular-nums text-foreground'>{children}</span>
);

/**
 * The service's standing facts — price list (live from getServicePrice()),
 * account runway (account-level, shared across services), and session-key
 * delegation — as one quiet strip: three labeled rows, hairline dividers,
 * actions on the right. These are ambient context, deliberately quieter than
 * the money cards below them.
 */
export const ServiceFacts = () => {
  const { address, chainId } = useConnection();
  const network = getNetworkFromChainId(chainId);
  const pricing = useServicePricing();
  const runway = useAccountRunway(address?.toLowerCase(), network);
  const { keys } = useSessionKeys(network, (address ?? "0x") as Hex);
  const activeKeys = keys.filter((key) => key.status === "active").length;

  const price = (value: bigint): string => formatTokenTruncated(value, TOKEN_DECIMALS, "USDFC");

  return (
    <div className='divide-y rounded-lg border bg-muted/20 px-4'>
      {pricing ? (
        <FactRow icon={<Tag className='size-3.5' />} label='Pricing'>
          Storage <Value>{price(pricing.storagePerTiBPerMonth)}</Value> / TiB / month
          {pricing.cdnEgressPerTiB > 0n ? (
            <>
              {" "}
              · CDN egress <Value>{price(pricing.cdnEgressPerTiB)}</Value> / TiB
            </>
          ) : null}
          {pricing.cacheMissEgressPerTiB > 0n ? (
            <>
              {" "}
              · cache-miss <Value>{price(pricing.cacheMissEgressPerTiB)}</Value> / TiB
            </>
          ) : null}
          {pricing.minimumPerMonth > 0n ? (
            <>
              {" "}
              · minimum <Value>{price(pricing.minimumPerMonth)}</Value> / month
            </>
          ) : null}
        </FactRow>
      ) : null}

      {runway ? (
        <FactRow
          icon={<Hourglass className='size-3.5' />}
          label='Runway'
          action={
            <Link href='/console' className='font-medium text-primary hover:underline'>
              Dashboard →
            </Link>
          }
        >
          <Value>~{runway.days} days</Value> — covers current spend until {formatDate(runway.coveredUntil)} · shared
          across services
        </FactRow>
      ) : null}

      {address ? (
        <FactRow
          icon={<KeyRound className='size-3.5' />}
          label='Session keys'
          action={
            <Link href='/console/session-keys' className='font-medium text-primary hover:underline'>
              {activeKeys > 0 ? "Manage →" : "Get a session key →"}
            </Link>
          }
        >
          {activeKeys > 0 ? (
            <>
              <Value>{activeKeys}</Value> active {activeKeys === 1 ? "key" : "keys"} can act on this service
            </>
          ) : (
            <>Let an app or agent upload to your datasets without your wallet key</>
          )}
        </FactRow>
      ) : null}
    </div>
  );
};
