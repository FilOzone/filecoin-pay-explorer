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
  /** `date` is null when there is no date to show: no runway data, no recurring charges or funding expired. */
  accountRunway: { date: string | null; detail: string };
};

type ServiceMetricsRowsInput = Pick<ServiceMetricsResponse, "account" | "rails" | "oneTimePayments"> & {
  /** Every payment once `oneTimePayments`, the first page, overflowed. Undefined when that page holds them all. */
  allOneTimePayments?: ServiceOneTimePayment[] | OneTimeUnavailableReason;
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
): ServiceMetricsRow["accountRunway"] => {
  if (!userToken) return { date: null, detail: "—" };

  const { fundedUntilTimestamp } = calculateFundedUntil(userToken, currentTimestamp);
  const { daysRemaining, isExpired } = deriveFundsHealth(fundedUntilTimestamp, currentTimestamp);
  const detail = formatRunwayDetail(daysRemaining, isExpired);

  if (isExpired || daysRemaining === null) return { date: null, detail };
  return { date: formatFutureTimestamp(fundedUntilTimestamp, currentTimestamp), detail };
};

/**
 * One row per approved token with a locked deposit, a paying rail or a payment this month. Amounts are never summed
 * across tokens.
 */
export const buildServiceMetricsRows = (
  { account, rails, oneTimePayments, allOneTimePayments }: ServiceMetricsRowsInput,
  currentTimestamp: bigint,
): ServiceMetricsRow[] => {
  if (!account) return [];
  const paymentsToTotal = allOneTimePayments ?? oneTimePayments;

  return account.operatorApprovals
    .filter(
      ({ lockupUsage, token }) =>
        BigInt(lockupUsage) > 0n || [...rails, ...oneTimePayments].some((entry) => entry.token.id === token.id),
    )
    .map(({ lockupUsage, token }) => {
      const tokenRails = rails.filter((rail) => rail.token.id === token.id);

      return {
        token,
        recurringPerMonth: tokenRails.reduce(
          (total, rail) => total + BigInt(rail.paymentRate) * TIME_CONSTANTS.EPOCHS_PER_MONTH,
          0n,
        ),
        oneTimeThisMonth:
          typeof paymentsToTotal === "string"
            ? paymentsToTotal
            : paymentsToTotal
                .filter((payment) => payment.token.id === token.id)
                .reduce((total, payment) => total + BigInt(payment.totalAmount), 0n),
        lockedDeposit: BigInt(lockupUsage),
        noticeCopy: formatNoticeCopy(
          new Set(tokenRails.map((rail) => BigInt(rail.lockupPeriod)).filter((period) => period > 0n)),
        ),
        accountRunway: formatAccountRunway(
          account.userTokens.find((userToken) => userToken.token.id === token.id),
          currentTimestamp,
        ),
      };
    })
    .sort((a, b) => a.token.symbol.localeCompare(b.token.symbol));
};
