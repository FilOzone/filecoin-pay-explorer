"use client";

import type { ReactNode } from "react";
import ConsoleProviders from "@/components/UserConsole/ConsoleProviders";
import ConsoleShell from "@/components/UserConsole/ConsoleShell";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <ConsoleProviders>
      <ConsoleShell>{children}</ConsoleShell>
    </ConsoleProviders>
  );
}
