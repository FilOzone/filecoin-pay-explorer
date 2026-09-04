import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { EmptyStateCard } from "@filecoin-foundation/ui-filecoin/EmptyStateCard";
import { AlertCircle, SearchIcon } from "lucide-react";

/**
 * The empty and error states shared by the paginated explorer list pages
 * (accounts, operators, rails). They all render the same card with the same
 * actions; only the entity noun and the "no results" wording differ.
 */

type EntityLabelProps = {
  /** Plural, lowercase — it is interpolated mid-sentence. */
  entityLabel: string;
};

export function ListErrorState({
  entityLabel,
  error,
  onRetry,
}: EntityLabelProps & { error: Error; onRetry: () => void }) {
  return (
    <EmptyStateCard
      icon={AlertCircle}
      title={`Failed to load ${entityLabel}`}
      titleTag='h2'
      description={error?.message || "Something went wrong"}
    >
      <Button onClick={onRetry} variant='primary' size='compact'>
        Retry
      </Button>
    </EmptyStateCard>
  );
}

/** Nothing indexed yet, as opposed to nothing matching a search. */
export function ListEmptyInitial({ entityLabel }: EntityLabelProps) {
  return (
    <EmptyStateCard
      icon={SearchIcon}
      title={`No ${entityLabel} found`}
      titleTag='h2'
      description={`There are no ${entityLabel} to display at the moment.`}
    />
  );
}

export type ListEmptyNoResultsProps = {
  /** What the reader should try next; the pages search on different things. */
  description: string;
  /** Names what gets cleared: a search box on some pages, filters on others. */
  clearLabel: string;
  onClear: () => void;
};

export function ListEmptyNoResults({ description, clearLabel, onClear }: ListEmptyNoResultsProps) {
  return (
    <EmptyStateCard icon={SearchIcon} title='No results found' titleTag='h2' description={description}>
      <Button onClick={onClear} variant='ghost' size='compact'>
        {clearLabel}
      </Button>
    </EmptyStateCard>
  );
}
