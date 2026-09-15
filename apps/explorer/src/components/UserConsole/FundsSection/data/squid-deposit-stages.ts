import type { SquidDepositStage } from "./squid-deposit-execution";

/** The execution stages plus the moment before the route is requested. */
export type SquidDepositUiStage = SquidDepositStage | "preparing";

/**
 * What the user should do or wait for at each stage. A first purchase signs an
 * approval before the swap, so those two signatures are numbered.
 */
export function describeSquidDepositStage(
  stage: SquidDepositUiStage,
  { hasApproved, isEmbedded, symbol }: { hasApproved: boolean; isEmbedded: boolean; symbol: string },
): string {
  switch (stage) {
    case "preparing":
      return "Preparing the route…";
    case "approving":
      return isEmbedded
        ? `Step 1 of 2: approving ${symbol} with your Privy wallet…`
        : `Step 1 of 2: approve ${symbol} in your wallet`;
    case "swap-requested":
      if (isEmbedded) {
        return hasApproved
          ? "Step 2 of 2: signing the swap with your Privy wallet…"
          : "Signing the swap with your Privy wallet…";
      }
      return hasApproved ? "Step 2 of 2: confirm the swap in your wallet" : "Confirm the swap in your wallet";
    case "swap-broadcast":
      return "Waiting for the source network to confirm…";
    case "bridging":
      return "Bridging to Filecoin and depositing. This takes about two minutes.";
    case "verifying":
      return "Confirming your Filecoin Pay balance…";
  }
}

export type SquidDepositProgressStep = { label: string; state: "done" | "current" | "upcoming" };

const PROGRESS_ORDER: SquidDepositUiStage[] = [
  "preparing",
  "approving",
  "swap-requested",
  "swap-broadcast",
  "bridging",
  "verifying",
];

/**
 * The deposit as a timeline. The approval step appears only on a first
 * purchase, which is the only time the wallet asks for it.
 */
export function describeSquidDepositProgress(
  stage: SquidDepositUiStage,
  { hasApproved, symbol }: { hasApproved: boolean; symbol: string },
): SquidDepositProgressStep[] {
  const labels: Record<SquidDepositUiStage, string> = {
    preparing: "Prepare the route",
    approving: `Approve ${symbol}`,
    "swap-requested": "Confirm the swap",
    "swap-broadcast": "Source network confirms",
    bridging: "Bridge and deposit",
    verifying: "Balance confirmed",
  };
  const current = PROGRESS_ORDER.indexOf(stage);
  return PROGRESS_ORDER.filter((step) => step !== "approving" || hasApproved || stage === "approving").map((step) => {
    const index = PROGRESS_ORDER.indexOf(step);
    return {
      label: labels[step],
      state: index < current ? "done" : index === current ? "current" : "upcoming",
    };
  });
}
