"use client";
import type { ReactNode } from "react";
import ConsoleProviders from "@/components/UserConsole/providers/ConsoleProviders";
import { ConsoleShell } from "../_shell/ConsoleShell";

// Kept separate from ConsoleShell: a component can't mount a provider and read from it.
const ConsoleLayout = ({ children }: { children: ReactNode }) => (
  <ConsoleProviders>
    <ConsoleShell>{children}</ConsoleShell>
  </ConsoleProviders>
);

export default ConsoleLayout;
