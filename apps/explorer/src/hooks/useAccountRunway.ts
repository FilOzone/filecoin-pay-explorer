import { useAccountTokens } from "@/hooks/useAccountDetails";
import useSynapse from "@/hooks/useSynapse";
import type { Network } from "@/types";

/** 30-second epochs: 2,880 per day. */
const EPOCHS_PER_DAY = 2_880n;

const MS_PER_DAY = 86_400_000;

export type AccountRunway = {
  days: number;
  coveredUntil: Date;
};

/**
 * Account-level runway: how long the USDFC deposit covers the account's total
 * streaming rate, across every service. There is no per-dataset runway — funds
 * are account-level in Filecoin Pay.
 *
 * Approximation: `funds − lockupCurrent` understates what the streaming rate
 * can still consume by the not-yet-settled slice of the lockup; good enough
 * for a banner, not for a solvency check.
 */
export const useAccountRunway = (accountId: string | undefined, network: Network): AccountRunway | undefined => {
  const { constants } = useSynapse();
  const { data } = useAccountTokens(accountId ?? "", 1, { networkOverride: network, pageSize: 100 });

  const usdfc = data?.userTokens.find(
    (userToken) => userToken.token.id.toLowerCase() === constants.contracts.usdfc.toLowerCase(),
  );
  if (!usdfc) return undefined;

  const funds = BigInt(usdfc.funds);
  const lockup = BigInt(usdfc.lockupCurrent);
  const rate = BigInt(usdfc.lockupRate);
  if (rate === 0n) return undefined; // no streaming spend: nothing is draining, no runway to warn about

  const available = funds - lockup;
  const days = available > 0n ? Number(available / rate / EPOCHS_PER_DAY) : 0;
  return { days, coveredUntil: new Date(Date.now() + days * MS_PER_DAY) };
};
