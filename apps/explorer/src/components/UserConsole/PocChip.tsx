/**
 * Honest-labeling chip for the POC: marks UI whose data is mocked or hardcoded
 * rather than pulled from chain/subgraph, and actions that are not wired to
 * transactions yet. Anything WITHOUT this chip is real.
 */
export const PocChip = ({ label }: { label: string }) => (
  <span className='rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'>
    {label}
  </span>
);
