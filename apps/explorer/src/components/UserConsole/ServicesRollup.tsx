"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { Account } from "@filecoin-pay/types";
import { Card } from "@filecoin-pay/ui/components/card";
import { Hourglass } from "lucide-react";
import Link from "next/link";
import { knownAddresses } from "@/constants/known-addresses";
import { useAccountRails } from "@/hooks/useAccountDetails";
import { useAccountRunway } from "@/hooks/useAccountRunway";
import { useServiceMetadata } from "@/hooks/useServiceMetadata";
import useSynapse from "@/hooks/useSynapse";
import type { Network } from "@/types";
import { formatAddress, formatTokenTruncated } from "@/utils/formatter";
import { rollupRailsByOperator } from "@/utils/railRollup";

type ServicesRollupProps = {
  account: Account;
  network: Network;
};

/**
 * The Dashboard's per-service money rows: one row per operator this account
 * pays, from real rails. Service = operator of the rail (ruling 2026-08-18);
 * each row links to the service page — there is no per-service billing detail
 * page behind it.
 *
 * Page 1 of rails only (the known billing-POC aggregation gap; the production
 * fix fetches all rails before grouping).
 */
export const ServicesRollup = ({ account, network }: ServicesRollupProps) => {
  const { constants } = useSynapse();
  const fwssAddress = constants.chain.contracts.fwss.address.toLowerCase();
  const { name: fwssName } = useServiceMetadata();

  const { data: railsData } = useAccountRails(account.id, 1, { networkOverride: network });
  const runway = useAccountRunway(account.id, network);
  // account.id in the subgraph is the lowercase address.
  const rollups = rollupRailsByOperator(railsData?.rails ?? [], account.id);

  if (rollups.length === 0) return null;

  const serviceName = (operator: string): string => {
    if (operator === fwssAddress && fwssName) return fwssName;
    return knownAddresses[operator] ?? formatAddress(operator);
  };

  return (
    <Card className='flex flex-col gap-3 p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <h3 className='font-medium'>Services</h3>
        {runway ? (
          <span className='ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground'>
            <Hourglass className='size-4' />
            Account runway ~{runway.days} days
          </span>
        ) : null}
      </div>

      <ul className='flex flex-col divide-y'>
        {rollups.map((rollup) => (
          <li key={rollup.operatorAddress} className='flex flex-wrap items-center gap-3 py-3'>
            <div className='flex min-w-0 flex-1 flex-col'>
              <span className='truncate font-medium'>{serviceName(rollup.operatorAddress)}</span>
              <span className='text-xs text-muted-foreground tabular-nums'>
                {formatTokenTruncated(rollup.monthlyRate, rollup.tokenDecimals, rollup.tokenSymbol)} / mo ·{" "}
                {rollup.activeRailCount} active rails ·{" "}
                {formatTokenTruncated(rollup.streamingLockup, rollup.tokenDecimals, rollup.tokenSymbol)} locked
              </span>
            </div>
            <Button variant='ghost' disabled title='Batch settle is coming — settle per rail in the rails table below'>
              Settle all ({rollup.railCount})
            </Button>
            {rollup.operatorAddress === fwssAddress ? (
              <Link href='/console/services/warm-storage' className='text-sm font-medium text-primary hover:underline'>
                View service →
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
};
