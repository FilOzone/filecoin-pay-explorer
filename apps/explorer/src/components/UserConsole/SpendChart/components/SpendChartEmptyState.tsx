import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { ChartBarIcon } from "@phosphor-icons/react";
import SpendChartLayout from "./SpendChartLayout";

type SpendChartEmptyStateProps = {
  tokenSymbol: string;
};

const SpendChartEmptyState = ({ tokenSymbol }: SpendChartEmptyStateProps) => (
  <SpendChartLayout tokenSymbol={tokenSymbol}>
    <EmptyStateCard
      titleTag='h4'
      title='Nothing scheduled yet'
      description={`You have no rails paying in ${tokenSymbol}, so there is nothing to chart.`}
      icon={ChartBarIcon}
    />
  </SpendChartLayout>
);

export default SpendChartEmptyState;
