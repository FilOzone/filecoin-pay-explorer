import type { useGraphQLClient } from "@/hooks/useGraphQLQuery";
import { GET_SUBGRAPH_BLOCK } from "@/services/grapql/queries";

/** graph-node's per-request maximum. Every page `fetchAllPages` reads must ask for this many rows. */
export const SUBGRAPH_PAGE_SIZE = 1_000;

type SubgraphMeta = { block: { number: number } };

/** The indexed block to pin a walk's pages to, since a walk must never run unpinned. */
export async function fetchSubgraphMeta(
  executeQuery: ReturnType<typeof useGraphQLClient>["executeQuery"],
  signal: AbortSignal,
): Promise<SubgraphMeta> {
  // Nullable here and only here: the subgraph omits `_meta` while a deployment is starting up. Throwing lets Query retry.
  const { _meta } = await executeQuery<{ _meta: SubgraphMeta | null }>(GET_SUBGRAPH_BLOCK, undefined, signal);
  if (!_meta) throw new Error("Subgraph has not reported an indexed block yet");
  return _meta;
}

/**
 * Walks a cursor-paged collection until it is exhausted or `maxPages` is hit.
 *
 * Cursors on `id` rather than `skip`, which graph-node caps at 5,000. Mirrors
 * `getApprovedOperatorClients`, including the guard against a cursor that fails
 * to advance — that would otherwise spin forever.
 */
export async function fetchAllPages<T extends { id: string }>(
  fetchPage: (cursor: string) => Promise<T[]>,
  maxPages: number,
): Promise<{ items: T[]; reachedPageLimit: boolean }> {
  const items: T[] = [];
  let cursor = "0x";

  for (let page = 0; page < maxPages; page++) {
    const rows = await fetchPage(cursor);
    items.push(...rows);
    if (rows.length < SUBGRAPH_PAGE_SIZE) return { items, reachedPageLimit: false };

    const nextCursor = rows[rows.length - 1].id;
    if (!nextCursor || nextCursor === cursor) throw new Error("Subgraph pagination did not advance");
    cursor = nextCursor;
  }

  // Reaching here means every page was full, which data ending exactly on the
  // cap looks identical to. One more read tells them apart, and without it a
  // complete collection reports itself as possibly truncated. Only collections
  // already at the cap pay for it, and its rows are dropped: they fall outside
  // the pages the cap allows, so keeping them would move the boundary rather
  // than raise it.
  const beyondCap = await fetchPage(cursor);

  return { items, reachedPageLimit: beyondCap.length > 0 };
}
