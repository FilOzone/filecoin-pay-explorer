import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import RailsSectionLayout from "./RailsSectionLayout";

function RailsLoadingState() {
  return (
    <RailsSectionLayout>
      <LoadingStateCard message='Loading payment rails...' />
    </RailsSectionLayout>
  );
}

export default RailsLoadingState;
