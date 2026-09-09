import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { ChartBarIcon } from "@phosphor-icons/react";
import SpendChartLayout from "./SpendChartLayout";

type SpendChartEmptyStateProps = {
  tokenSymbol: string;
};

/**
 * Shown when every charted month totals zero, which is not the same as having no
 * rails.
 */
const SpendChartEmptyState = ({ tokenSymbol }: SpendChartEmptyStateProps) => (
  <SpendChartLayout tokenSymbol={tokenSymbol}>
    <EmptyStateCard
      titleTag='h4'
      title='Nothing in the last six months'
      description={`No ${tokenSymbol} has been scheduled or paid over the months charted here.`}
      icon={ChartBarIcon}
    />
  </SpendChartLayout>
);

export default SpendChartEmptyState;
