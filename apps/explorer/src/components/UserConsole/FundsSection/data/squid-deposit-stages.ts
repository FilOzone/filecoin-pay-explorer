import type { SquidDepositSignature, SquidDepositStage } from "./squid-deposit-execution";

/** The execution stages plus the moment before the route is requested. */
export type SquidDepositUiStage = SquidDepositStage | "preparing";

/** "Step 2 of 3: …" when execution said which signature this is; the bare phrase otherwise. */
function numbered(signature: SquidDepositSignature | null, phrase: string): string {
  if (!signature) return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  return `Step ${signature.index + 1} of ${signature.total}: ${phrase}`;
}

/**
 * What the user should do or wait for at each stage. The signature stages are
 * numbered off execution's plan, so a reset, approve, route run reads 1 to 3 of 3.
 */
export function describeSquidDepositStage(
  stage: SquidDepositUiStage,
  { signature, isEmbedded, symbol }: { signature: SquidDepositSignature | null; isEmbedded: boolean; symbol: string },
): string {
  switch (stage) {
    case "preparing":
      return "Preparing the route…";
    case "approving":
      if (signature?.kind === "reset") {
        return numbered(
          signature,
          isEmbedded
            ? `resetting the ${symbol} allowance with your Privy wallet…`
            : `reset the ${symbol} allowance in your wallet`,
        );
      }
      return numbered(
        signature,
        isEmbedded ? `approving ${symbol} with your Privy wallet…` : `approve ${symbol} in your wallet`,
      );
    case "swap-requested":
      return numbered(
        signature,
        isEmbedded ? "signing the swap with your Privy wallet…" : "confirm the swap in your wallet",
      );
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
 * The deposit as a timeline. The approval step appears only when the plan has
 * more than the route to sign, which is the only time the wallet asks for it.
 */
export function describeSquidDepositProgress(
  stage: SquidDepositUiStage,
  { signature, symbol }: { signature: SquidDepositSignature | null; symbol: string },
): SquidDepositProgressStep[] {
  const labels: Record<SquidDepositUiStage, string> = {
    preparing: "Prepare the route",
    approving: `Approve ${symbol}`,
    "swap-requested": "Confirm the swap",
    "swap-broadcast": "Source network confirms",
    bridging: "Bridge and deposit",
    verifying: "Confirm balance",
  };
  const current = PROGRESS_ORDER.indexOf(stage);
  const hasApproval = stage === "approving" || (signature?.total ?? 1) > 1;
  return PROGRESS_ORDER.filter((step) => step !== "approving" || hasApproval).map((step) => {
    const index = PROGRESS_ORDER.indexOf(step);
    const state = index < current ? "done" : "upcoming";
    return { label: labels[step], state: index === current ? "current" : state };
  });
}
