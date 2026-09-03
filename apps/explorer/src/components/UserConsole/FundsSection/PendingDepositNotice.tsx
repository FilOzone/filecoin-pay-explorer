"use client";

import type { Address } from "viem";
import { useFundingLaunch } from "@/components/UserConsole/FundingLaunchContext";
import { PendingDepositBanner } from "./components/PendingDepositBanner";
import { usePendingSquidDeposit } from "./hooks/usePendingSquidDeposit";

/** Shows an in-flight USDC deposit on every console page until the dialog is open or the deposit settles. */
export function PendingDepositNotice({ address }: { address: Address | undefined }) {
  const pending = usePendingSquidDeposit(address);
  const { isCrossChainPaymentOpen, openCrossChainPayment } = useFundingLaunch();
  if (!pending || isCrossChainPaymentOpen) return null;
  return <PendingDepositBanner onView={openCrossChainPayment} pending={pending} />;
}
