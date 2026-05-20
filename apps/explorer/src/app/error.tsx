"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { WarningCircleIcon } from "@phosphor-icons/react";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  return (
    <ErrorStateCard
      titleTag='h1'
      IconComponent={WarningCircleIcon}
      title='Something went wrong'
      description={error.message || "An unexpected error occurred. Please try again."}
    >
      <Button variant='primary' onClick={reset}>
        Try again
      </Button>
    </ErrorStateCard>
  );
}
