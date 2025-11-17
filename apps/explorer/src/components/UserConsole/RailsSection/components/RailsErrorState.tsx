import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import RailsSectionLayout from "./RailsSectionLayout";

function RailsErrorState() {
  return (
    <RailsSectionLayout>
      <ErrorStateCard
        titleTag='h2'
        title='Failed to load rails'
        description='Unable to fetch your payment rails. Please try again.'
      />
    </RailsSectionLayout>
  );
}

export default RailsErrorState;
