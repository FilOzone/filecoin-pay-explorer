import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { WarningCircleIcon } from "@phosphor-icons/react";

const ErrorState = ({ error }: { error: Error | null }) => {
  return (
    <ErrorStateCard
      titleTag='h2'
      IconComponent={WarningCircleIcon}
      title='Failed to Load Account'
      description={error?.message || "Something went wrong. Please try again."}
    />
  );
};

export default ErrorState;
