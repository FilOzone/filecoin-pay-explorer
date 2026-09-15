"use client";
import { useEffect, useState } from "react";

/**
 * Reads the named search params once on mount and removes them from the
 * address bar, so a refresh or a shared URL does not replay a link's request.
 * Returns a snapshot of the whole query when at least one named key was
 * present, otherwise null.
 */
export function useConsumedSearchParams(keys: readonly string[]): URLSearchParams | null {
  const [snapshot, setSnapshot] = useState<URLSearchParams | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount; the key list is fixed per call site
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!keys.some((key) => params.has(key))) return;
    setSnapshot(new URLSearchParams(params));
    for (const key of keys) params.delete(key);
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, []);
  return snapshot;
}
