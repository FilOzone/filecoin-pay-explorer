import { Badge } from "@filecoin-foundation/ui-filecoin/Badge";
import { Spinner } from "@filecoin-foundation/ui-filecoin/Spinner";
import { clsx } from "clsx";
import type { SearchOption } from "./types";

const optionKey = (option: SearchOption) =>
  option.kind === "rail" ? `rail-${option.railId}` : `${option.result.type}-${option.result.address}`;

export function SearchResultsDropdown({
  options,
  isLoading,
  activeIndex,
  onSelect,
  onHighlight,
}: {
  options: SearchOption[];
  isLoading: boolean;
  activeIndex: number;
  onSelect: (option: SearchOption) => void;
  onHighlight: (index: number) => void;
}) {
  if (isLoading) {
    return (
      <div className='w-full flex items-center justify-center py-10'>
        <Spinner size={30} message='Loading Accounts & Operators...' />
      </div>
    );
  }

  if (options.length === 0) {
    return <p className='px-4 py-3 text-sm text-muted-foreground'>No accounts or operators found for this address.</p>;
  }

  return (
    <ul className='divide-y divide-border'>
      {options.map((option, index) => {
        const isActive = index === activeIndex;
        return (
          <li key={optionKey(option)}>
            <button
              type='button'
              className={clsx(
                "w-full text-left px-4 py-3 flex items-center gap-6 transition-colors cursor-pointer",
                isActive ? "bg-accent" : "hover:bg-accent",
              )}
              onClick={() => onSelect(option)}
              onMouseEnter={() => onHighlight(index)}
            >
              {option.kind === "rail" ? (
                <>
                  <Badge variant='secondary'>rail</Badge>
                  <span className='font-mono text-sm'>Rail #{option.railId}</span>
                  <span className='ml-auto shrink-0 text-sm text-muted-foreground'>View →</span>
                </>
              ) : (
                <>
                  <Badge variant={option.result.type === "account" ? "primary" : "secondary"}>
                    {option.result.type}
                  </Badge>
                  <span className='font-mono text-sm truncate'>{option.result.address}</span>
                  <span className='ml-auto shrink-0 text-sm text-muted-foreground'>
                    {option.result.totalRails.toString()} rails
                  </span>
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
