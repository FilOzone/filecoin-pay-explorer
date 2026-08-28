"use client";

/** Same compact destructive pill as the session-keys Revoke button — one destructive button language across the console. */
export const TerminateButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type='button'
    onClick={onClick}
    className='rounded-full border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 text-xs font-medium px-3 py-1'
  >
    Terminate
  </button>
);
