import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { AlertCircle } from "lucide-react";
import SpendChartLayout from "./SpendChartLayout";

type SpendChartErrorStateProps = {
  tokenSymbol: string;
};

const SpendChartErrorState = ({ tokenSymbol }: SpendChartErrorStateProps) => (
  <SpendChartLayout tokenSymbol={tokenSymbol}>
    <ErrorStateCard
      titleTag='h4'
      title='Failed to load scheduled spend'
      description='Unable to fetch your rail history. Please try again.'
      IconComponent={AlertCircle}
    />
  </SpendChartLayout>
);

export default SpendChartErrorState;
