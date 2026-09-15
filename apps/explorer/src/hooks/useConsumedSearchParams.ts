"use client";
import { useEffect, useState } from "react";

/** Remove `keys` from the address bar without touching anything else in it. */
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
 * `keep` names params to read but leave in the URL. A request the owner has
 * to act on later, after switching networks, say, must outlive this mount:
 * anything that remounts the page would otherwise drop it, and a reload
 * could never bring it back. Whoever acts on it calls `dropSearchParams`.
 */
export function useConsumedSearchParams(keys: readonly string[], keep: readonly string[] = []): URLSearchParams | null {
  const [snapshot, setSnapshot] = useState<URLSearchParams | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount; the key list is fixed per call site
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (![...keys, ...keep].some((key) => params.has(key))) return;
    setSnapshot(new URLSearchParams(params));
    // A kept param stays, and so does anything it needs: a revoke link is
    // useless without the network it names.
    if (keep.some((key) => params.has(key))) return;
    dropSearchParams(keys);
  }, []);
  return snapshot;
}
