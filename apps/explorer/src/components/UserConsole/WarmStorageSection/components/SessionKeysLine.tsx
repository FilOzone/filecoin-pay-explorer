"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import type { Hex } from "viem";
import { useConnection } from "wagmi";
import { useSessionKeys } from "@/hooks/useSessionKeys";
import { getNetworkFromChainId } from "@/utils/network";

/**
 * Read-only pointer from the service page to the Account-level Session Keys
 * page (placement ruling 2026-08-27): key management lives in one place; the
 * service page only says whether keys can act here. Every scope today is an
 * FWSS permission, so "this service" is accurate.
 */
export const SessionKeysLine = () => {
  const { address, chainId } = useConnection();
  const network = getNetworkFromChainId(chainId);
  const { keys } = useSessionKeys(network, (address ?? "0x") as Hex);

  if (!address) return null;
  const activeCount = keys.filter((key) => key.status === "active").length;

  return (
    <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
      <KeyRound className='size-4' />
      {activeCount > 0 ? (
        <>
          {activeCount} session {activeCount === 1 ? "key" : "keys"} can act on this service ·{" "}
          <Link href='/console/session-keys' className='font-medium text-primary hover:underline'>
            Manage session keys →
          </Link>
        </>
      ) : (
        <>
          Let an app or agent upload to your datasets without your wallet key ·{" "}
          <Link href='/console/session-keys' className='font-medium text-primary hover:underline'>
            Get a session key →
          </Link>
        </>
      )}
    </p>
  );
};
