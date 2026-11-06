import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import type { ServiceMetricsResponse, ServiceOneTimePayment } from "@/hooks/useAccountServices";
import { formatFutureTimestamp } from "@/utils/formatter";
import { calculateFundedUntil } from "../../FundsSection/utils/calculateFundedUntil";
import { deriveFundsHealth, formatRunwayDetail } from "../../FundsSection/utils/fundsHealth";

type ServiceMetricsAccount = NonNullable<ServiceMetricsResponse["account"]>;

/** Payments still being read for a busy pair, or that could not be read, sit beside figures that could. */
type OneTimeUnavailableReason = "loading" | "unavailable";

export type ServiceMetricsRow = {
  token: ServiceMetricsAccount["operatorApprovals"][number]["token"];
  recurringPerMonth: bigint;
  oneTimeThisMonth: bigint | OneTimeUnavailableReason;
  /** Holds a terminated rail's whole deposit until it finalizes, even as settlement pays it out. */
  lockedDeposit: bigint;
  noticeCopy: string | null;
  accountRunwayText: string;
};

type ServiceMetricsRowsInput = Pick<ServiceMetricsResponse, "account" | "rails"> & {
  oneTimePayments: ServiceOneTimePayment[] | OneTimeUnavailableReason;
  /** Undefined when every approved token counts: the pair has only one, or the check has not answered. */
  tokenIdsWithRails: string[] | undefined;
};

const formatNoticeCopy = (noticePeriods: ReadonlySet<bigint>): string | null => {
  if (noticePeriods.size === 0) return null;

  const [period] = noticePeriods;
  if (noticePeriods.size === 1 && period % TIME_CONSTANTS.EPOCHS_PER_DAY === 0n) {
    return `Pays the ${period / TIME_CONSTANTS.EPOCHS_PER_DAY}-day notice after you terminate`;
  }
  return "Pays the notice period after you terminate";
};

const formatAccountRunway = (
  userToken: ServiceMetricsAccount["userTokens"][number] | undefined,
  currentTimestamp: bigint,
): string => {
  if (!userToken) return "—";

  const { fundedUntilTimestamp } = calculateFundedUntil(userToken, currentTimestamp);
  const { daysRemaining, isExpired } = deriveFundsHealth(fundedUntilTimestamp, currentTimestamp);
  const detail = formatRunwayDetail(daysRemaining, isExpired);

  if (isExpired || daysRemaining === null) return detail;
  return `${formatFutureTimestamp(fundedUntilTimestamp, currentTimestamp)} (${detail})`;
};

/** One row per token the pair has rails in. Amounts are never summed across tokens. */
export const buildServiceMetricsRows = (
  { account, rails, oneTimePayments, tokenIdsWithRails }: ServiceMetricsRowsInput,
  currentTimestamp: bigint,
): ServiceMetricsRow[] => {
  if (!account) return [];

  return account.operatorApprovals
    .filter(({ token }) => tokenIdsWithRails?.includes(token.id) ?? true)
    .map(({ lockupUsage, token }) => {
      const tokenRails = rails.filter((rail) => rail.token.id === token.id);

      return {
        token,
        recurringPerMonth: tokenRails.reduce(
          (total, rail) => total + BigInt(rail.paymentRate) * TIME_CONSTANTS.EPOCHS_PER_MONTH,
          0n,
        ),
        oneTimeThisMonth:
          typeof oneTimePayments === "string"
            ? oneTimePayments
            : oneTimePayments
                .filter((payment) => payment.token.id === token.id)
                .reduce((total, payment) => total + BigInt(payment.totalAmount), 0n),
        lockedDeposit: BigInt(lockupUsage),
        noticeCopy: formatNoticeCopy(
          new Set(tokenRails.map((rail) => BigInt(rail.lockupPeriod)).filter((period) => period > 0n)),
        ),
        accountRunwayText: formatAccountRunway(
          account.userTokens.find((userToken) => userToken.token.id === token.id),
          currentTimestamp,
        ),
      };
    })
    .sort((a, b) => a.token.symbol.localeCompare(b.token.symbol));
};
