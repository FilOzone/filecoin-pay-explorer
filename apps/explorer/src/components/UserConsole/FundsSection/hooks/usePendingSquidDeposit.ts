import { useEffect, useState } from "react";
import type { Address } from "viem";
import {
  loadPendingSquidDeposit,
  type PendingSquidDeposit,
  subscribeToPendingSquidDeposit,
} from "../data/squid-deposit-tracker";

function readPendingDeposit(recipient: Address): PendingSquidDeposit | null {
  try {
    return loadPendingSquidDeposit(window.localStorage, recipient);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); then there is nothing to show.
    return null;
  }
}

/** The recipient's in-flight USDC deposit from local storage, kept current across tabs. */
export function usePendingSquidDeposit(recipient: Address | undefined): PendingSquidDeposit | null {
  const [pending, setPending] = useState<PendingSquidDeposit | null>(null);
  useEffect(() => {
    if (!recipient) {
      setPending(null);
      return;
    }
    const refresh = () => setPending(readPendingDeposit(recipient));
    refresh();
    return subscribeToPendingSquidDeposit(recipient, refresh);
  }, [recipient]);
  return pending;
}
