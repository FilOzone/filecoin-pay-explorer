"use client";

import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import { Popover, PopoverAnchor, PopoverContent } from "@filecoin-pay/ui/components/popover";
import { useId, useState } from "react";

export type SearchableOption = {
  aliases?: readonly string[];
  detail?: string;
  label: string;
  secondaryLabel?: string;
  value: string;
};

export function filterSearchableOptions(options: readonly SearchableOption[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return options;
  return options.filter(
    (option) =>
      option.label.toLowerCase().includes(normalizedQuery) ||
      option.aliases?.some((alias) => alias.toLowerCase().includes(normalizedQuery)),
  );
}

export function resolveSearchableOption(options: readonly SearchableOption[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const labelMatches = options.filter((option) => option.label.toLowerCase() === normalizedQuery);
  if (labelMatches.length === 1) return labelMatches[0].value;
  if (labelMatches.length > 1) return "";
  const aliasMatches = options.filter((option) =>
    option.aliases?.some((alias) => alias.toLowerCase() === normalizedQuery),
  );
  return aliasMatches.length === 1 ? aliasMatches[0].value : "";
}

type SearchableSelectProps = {
  "aria-describedby"?: string;
  disabled?: boolean;
  id: string;
  invalidMessage: string;
  onValueChange: (value: string) => void;
  options: readonly SearchableOption[];
  placeholder: string;
  value: string;
};

export function SearchableSelect({
  "aria-describedby": ariaDescribedBy,
  disabled,
  id,
  invalidMessage,
  onValueChange,
  options,
  placeholder,
  value,
}: SearchableSelectProps) {
  const listId = useId();
  const errorId = `${id}-error`;
  const selected = options.find((option) => option.value.toLowerCase() === value.toLowerCase());
  const [query, setQuery] = useState(selected?.label ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredOptions = filterSearchableOptions(options, query);
  const isInvalid = isTouched && query.trim() !== "" && !selected;

  const select = (option: SearchableOption) => {
    setQuery(option.label);
    setIsTouched(false);
    setIsOpen(false);
    onValueChange(option.value);
  };

  return (
    <Popover open={isOpen && !disabled} onOpenChange={setIsOpen}>
      <PopoverAnchor asChild>
        <Input
          aria-activedescendant={isOpen ? `${listId}-${activeIndex}` : undefined}
          aria-autocomplete='list'
          aria-controls={listId}
          aria-describedby={[ariaDescribedBy, isInvalid ? errorId : ""].filter(Boolean).join(" ") || undefined}
          aria-expanded={isOpen}
          aria-invalid={isInvalid}
          autoComplete='off'
          disabled={disabled}
          id={id}
          onBlur={() => setIsTouched(true)}
          onChange={(nextQuery) => {
            setQuery(nextQuery);
            setIsTouched(false);
            setActiveIndex(0);
            setIsOpen(true);
            onValueChange(resolveSearchableOption(options, nextQuery));
          }}
          onClick={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && filteredOptions.length > 0) {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((index) => Math.min(index + 1, filteredOptions.length - 1));
            } else if (event.key === "ArrowUp" && filteredOptions.length > 0) {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && isOpen && filteredOptions[activeIndex]) {
              event.preventDefault();
              select(filteredOptions[activeIndex]);
            } else if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder={placeholder}
          role='combobox'
          type='search'
          value={query}
        />
      </PopoverAnchor>
      <PopoverContent
        align='start'
        className='max-h-72 w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1'
        onOpenAutoFocus={(event) => event.preventDefault()}
        onWheelCapture={(event) => {
          // Keep the dialog's scroll lock from consuming this portalled list's wheel events.
          event.stopPropagation();
        }}
        sideOffset={4}
      >
        <div aria-label='Source tokens' id={listId} role='listbox'>
          {filteredOptions.length === 0 ? (
            <p className='px-3 py-2 text-sm text-muted-foreground'>No matching tokens.</p>
          ) : (
            filteredOptions.map((option, index) => (
              <button
                aria-selected={option.value.toLowerCase() === value.toLowerCase()}
                className={`w-full rounded-sm px-3 py-2 text-left text-sm ${
                  index === activeIndex ? "bg-accent" : "hover:bg-accent"
                }`}
                id={`${listId}-${index}`}
                key={option.value}
                onClick={() => select(option)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                role='option'
                type='button'
              >
                <span className='flex items-center justify-between gap-3'>
                  <span className='flex min-w-0 items-baseline gap-2'>
                    <span className='shrink-0'>{option.label}</span>
                    {option.secondaryLabel && (
                      <span className='truncate text-xs text-muted-foreground'>{option.secondaryLabel}</span>
                    )}
                  </span>
                  {option.detail && <span className='shrink-0 text-xs text-muted-foreground'>{option.detail}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
      {isInvalid && (
        <p className='text-xs text-destructive' id={errorId}>
          {invalidMessage}
        </p>
      )}
    </Popover>
  );
}
