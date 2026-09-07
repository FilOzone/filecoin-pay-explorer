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
import { hasReachedSpendHistoryLimit, toSpendHistory } from "./utils/toSpendHistory";

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

  // The first instant of the current local month is all the windows need, and
  // collapsing the 30-second tick to it keeps them stable until month rollover.
  const now = new Date(Number(currentTimestamp) * 1_000);
  const monthAnchor = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const windows = useMemo(
    () => buildMonthWindows(new Date(monthAnchor), genesisTimestamp),
    [monthAnchor, genesisTimestamp],
  );

  // Windows are built before the fetch because their lower bound is what scopes
  // it. Both are primitives, so the query key only changes at month rollover.
  const { data, isLoading, isError } = useAccountSpendHistory(
    accountId,
    token.id,
    windows[0].startEpoch,
    windows[0].startTimestamp,
    { networkOverride: network },
  );

  const history = useMemo(() => (data ? toSpendHistory(data) : null), [data]);

  // Months come from the browser, because "last month" means the viewer's last
  // month. Accrual is capped at the block the history was read at, so it never
  // bills epochs whose rate changes and terminations are not indexed yet. The
  // loader guarantees this is present — it throws rather than letting the chart
  // accrue past the data.
  const indexedEpoch = data ? BigInt(data._meta?.block.number ?? 0) : 0n;

  const rows = useMemo(() => {
    if (!history) return null;

    const series = buildSpendSeries(history, windows, indexedEpoch);

    // Emptiness is a property of the totals, not of how many records came back
    return series.some((row) => row.total > 0n) ? series : null;
  }, [history, windows, indexedEpoch]);

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
