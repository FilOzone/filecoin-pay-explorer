const FIELD_CLASS = "rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm";

interface ExpiryPickerProps {
  /** For the caller's `<Label htmlFor>`. */
  id: string;
  presets: { label: string; seconds: number }[];
  /** A preset's index as a string, or "custom". Resolve it with `resolveExpiry`. */
  presetIndex: string;
  customDate: string;
  onPresetIndexChange: (presetIndex: string) => void;
  onCustomDateChange: (customDate: string) => void;
  customDateLabel: string;
  /** `YYYY-MM-DD` bounds for the custom date. */
  customDateRange?: { min: string; max: string };
  disabled?: boolean;
}

/** A preset duration, or "Custom date…" with a date input. */
export function ExpiryPicker({
  id,
  presets,
  presetIndex,
  customDate,
  onPresetIndexChange,
  onCustomDateChange,
  customDateLabel,
  customDateRange,
  disabled,
}: ExpiryPickerProps) {
  return (
    <>
      <select
        id={id}
        disabled={disabled}
        className={FIELD_CLASS}
        value={presetIndex}
        onChange={(e) => onPresetIndexChange(e.target.value)}
      >
        {presets.map((preset, i) => (
          <option key={preset.label} value={String(i)}>
            {preset.label}
          </option>
        ))}
        <option value='custom'>Custom date…</option>
      </select>
      {presetIndex === "custom" ? (
        <input
          type='date'
          disabled={disabled}
          aria-label={customDateLabel}
          className={FIELD_CLASS}
          min={customDateRange?.min}
          max={customDateRange?.max}
          value={customDate}
          onChange={(e) => onCustomDateChange(e.target.value)}
        />
      ) : null}
    </>
  );
}
