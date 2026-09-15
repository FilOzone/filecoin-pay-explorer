"use client";
import { useEffect, useState } from "react";

/** Remove `keys` from the address bar, leaving the rest. */
export function dropSearchParams(keys: readonly string[]): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (!keys.some((key) => params.has(key))) return;
  for (const key of keys) params.delete(key);
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  );
}

/**
 * Reads the named search params once on mount and removes them from the
 * address bar, so a refresh or a shared URL does not replay a link's request.
 * Returns a snapshot of the whole query when at least one named key was
 * present, otherwise null.
 *
 * `keep`: read but left in the URL; whoever acts on it calls `dropSearchParams`.
 */
export function useConsumedSearchParams(keys: readonly string[], keep: readonly string[] = []): URLSearchParams | null {
  const [snapshot, setSnapshot] = useState<URLSearchParams | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount; the key list is fixed per call site
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (![...keys, ...keep].some((key) => params.has(key))) return;
    setSnapshot(new URLSearchParams(params));
    // The kept param's companions stay too.
    if (keep.some((key) => params.has(key))) return;
    dropSearchParams(keys);
  }, []);
  return snapshot;
}
