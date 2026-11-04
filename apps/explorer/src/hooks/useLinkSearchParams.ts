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
 * Reads the search params once on mount and leaves them in the address bar,
 * for a link that must survive a remount; whoever acts on it calls
 * `dropSearchParams`. Returns a snapshot of the whole query when at least one
 * of `keys` was present, otherwise null.
 */
export function useLinkSearchParams(keys: readonly string[]): URLSearchParams | null {
  const [snapshot, setSnapshot] = useState<URLSearchParams | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount; the key list is fixed per call site
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (keys.some((key) => params.has(key))) setSnapshot(new URLSearchParams(params));
  }, []);
  return snapshot;
}
