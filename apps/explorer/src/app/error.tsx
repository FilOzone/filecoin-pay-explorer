"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { ErrorStateCard } from "@filecoin-foundation/ui-filecoin/ErrorStateCard";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { Navigation } from "@/components/shared";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  // Avoid leaking internal error details to end users in production; the raw
  // message is only useful during development.
  const description =
    process.env.NODE_ENV === "development"
      ? error.message || "An unexpected error occurred. Please try again."
      : error.digest
        ? `An unexpected error occurred. Please try again. Reference: ${error.digest}`
        : "An unexpected error occurred. Please try again.";

  return (
    <>
      {/* This boundary replaces segment layouts, so it must supply the header itself. */}
      <Navigation backgroundVariant='light' />
      <ErrorStateCard
        titleTag='h1'
        IconComponent={WarningCircleIcon}
        title='Something went wrong'
        description={description}
      >
        <Button variant='primary' onClick={reset}>
          Try again
        </Button>
      </ErrorStateCard>
    </>
  );
}
