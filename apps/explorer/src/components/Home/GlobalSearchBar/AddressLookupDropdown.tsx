import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { Spinner } from "@filecoin-foundation/ui-filecoin/Spinner";
import type { LookupResult } from "@/hooks/useAddressLookup";

export function AddressLookupDropdown({
  results,
  isLoading,
  onSelect,
}: {
  results: LookupResult[];
  isLoading: boolean;
  onSelect: (result: LookupResult) => void;
}) {
  if (isLoading) {
    return (
      <div className='w-full flex items-center justify-center py-10'>
        <Spinner size={30} message='Loading Accounts & Operators...' />
      </div>
    );
  }

  if (results.length === 0) {
    return <p className='px-4 py-3 text-sm text-muted-foreground'>No accounts or operators found for this address.</p>;
  }

  return (
    <ul className='divide-y divide-border'>
      {results.map((result) => (
        <li key={`${result.type}-${result.address}`}>
          <button
            type='button'
            className='w-full text-left px-4 py-3 hover:bg-accent flex items-center gap-6 transition-colors'
            onClick={() => onSelect(result)}
          >
            <Badge variant={result.type === "account" ? "primary" : "secondary"}>{result.type}</Badge>
            <span className='font-mono text-sm truncate'>{result.address}</span>
            <span className='ml-auto shrink-0 text-sm text-muted-foreground'>{result.totalRails.toString()} rails</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
