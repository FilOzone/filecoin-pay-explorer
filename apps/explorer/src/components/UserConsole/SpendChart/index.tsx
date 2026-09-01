import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import type { UserToken } from "@filecoin-pay/types";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { getChain } from "@/constants/chains";
import { useAccountSpendHistory } from "@/hooks/useAccountDetails";
import type { Network } from "@/types";
import { SpendChartEmptyState, SpendChartErrorState, SpendChartLayout, SpendChartLoadingState } from "./components";
import { buildMonthWindows } from "./utils/buildMonthWindows";
import { buildSpendSeries } from "./utils/buildSpendSeries";
import { timestampToEpoch } from "./utils/epoch";
import { hasReachedSpendHistoryLimit, toRailSpendInput } from "./utils/toRailSpendInput";

// Keeps recharts out of the initial console bundle. `ssr: false` because the
// chart measures its own container, which has no size on the server.
const SpendBarChart = dynamic(() => import("./components/SpendBarChart"), {
  ssr: false,
  loading: () => <LoadingStateCard message='Loading chart...' />,
});

type SpendChartProps = {
  accountId: string;
  network: Network;
  /** The token the funds overview is showing. Selection state stays there; this only follows it. */
  userToken: UserToken;
  /** Unix seconds, ticked once per epoch. Places the calendar months; never bounds accrual. */
  currentTimestamp: bigint;
};

export const SpendChart = ({ accountId, network, userToken, currentTimestamp }: SpendChartProps) => {
  const { token } = userToken;
  const { genesisTimestamp } = getChain(network);

  const { data, isLoading, isError } = useAccountSpendHistory(accountId, token.id, { networkOverride: network });

  const rails = useMemo(() => (data ? toRailSpendInput(data, genesisTimestamp) : null), [data, genesisTimestamp]);

  // The first instant of the current local month is all the windows need, and
  // collapsing the 30-second tick to it keeps them stable until month rollover.
  const now = new Date(Number(currentTimestamp) * 1_000);
  const monthAnchor = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const windows = useMemo(
    () => buildMonthWindows(new Date(monthAnchor), genesisTimestamp),
    [monthAnchor, genesisTimestamp],
  );

  // Months come from the browser, because "last month" means the viewer's last
  // month. Accrual is capped at the block this response was read at, so it never
  // bills epochs whose rate changes and terminations are not indexed yet. The
  // clock is only a fallback until a fresh deployment reports `_meta`.
  const indexedEpoch = data?._meta
    ? BigInt(data._meta.block.number)
    : timestampToEpoch(currentTimestamp, genesisTimestamp);

  const rows = useMemo(() => {
    if (!rails || rails.length === 0) return null;
    return buildSpendSeries(rails, windows, indexedEpoch);
  }, [rails, windows, indexedEpoch]);

  if (isLoading) {
    return <SpendChartLoadingState tokenSymbol={token.symbol} />;
  }

  if (isError) {
    return <SpendChartErrorState tokenSymbol={token.symbol} />;
  }

  if (!rows) {
    return <SpendChartEmptyState tokenSymbol={token.symbol} />;
  }

  return (
    <SpendChartLayout tokenSymbol={token.symbol}>
      <SpendBarChart
        rows={rows}
        tokenDecimals={token.decimals}
        tokenSymbol={token.symbol}
        hasReachedHistoryLimit={data ? hasReachedSpendHistoryLimit(data) : false}
      />
    </SpendChartLayout>
  );
};
