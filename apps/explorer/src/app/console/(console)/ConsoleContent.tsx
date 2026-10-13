import type { ReactNode } from "react";

/** The console page beside its sidebar. Rendered only once the access gate reports the console ready. */
export const ConsoleContent = ({ children, sidebar }: { children: ReactNode; sidebar: ReactNode }) => (
  <div className='flex gap-8'>
    <div className='hidden border-r pr-4 lg:flex'>{sidebar}</div>
    <div className='min-w-0 flex-1'>{children}</div>
  </div>
);
