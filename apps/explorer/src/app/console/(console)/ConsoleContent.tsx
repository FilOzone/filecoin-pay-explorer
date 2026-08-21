import type { ReactNode } from "react";
import type { ConsoleAccessState } from "./console-access";

export const ConsoleContent = ({
  accessState,
  children,
  sidebar,
}: {
  accessState: ConsoleAccessState;
  children: ReactNode;
  sidebar: ReactNode;
}) => (
  <div className={accessState === "ready" ? "flex gap-8" : undefined}>
    <div className={accessState === "ready" ? "hidden border-r pr-4 lg:flex" : "hidden"}>
      {accessState === "ready" ? sidebar : null}
    </div>
    <div className={accessState === "ready" ? "min-w-0 flex-1" : undefined}>{children}</div>
  </div>
);
