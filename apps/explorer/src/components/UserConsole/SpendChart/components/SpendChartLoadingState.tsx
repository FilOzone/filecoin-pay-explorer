import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import SpendChartLayout from "./SpendChartLayout";

type SpendChartLoadingStateProps = {
  tokenSymbol: string;
};

const SpendChartLoadingState = ({ tokenSymbol }: SpendChartLoadingStateProps) => (
  <SpendChartLayout tokenSymbol={tokenSymbol}>
    <LoadingStateCard message='Loading scheduled spend...' />
  </SpendChartLayout>
);

export default SpendChartLoadingState;
