"use client";
import type { ReactNode } from "react";
import ConsoleProviders from "@/components/UserConsole/providers/ConsoleProviders";
import { ConsoleShell } from "../_shell/ConsoleShell";

// Before login the gate replaces the page, so this is all a new user sees of the request.
const intro = (
  <header className='flex flex-col gap-2'>
    <h1 className='text-3xl font-medium tracking-tight'>Review a setup request</h1>
    <p className='max-w-prose text-muted-foreground'>
      Log in with the wallet your command-line tool should use. Nothing is approved until you review each step.
    </p>
  </header>
);

// The console's providers and wallet gate without its navigation: a CLI link
// lands here to review one request, like an OAuth consent page.
const SetupLayout = ({ children }: { children: ReactNode }) => (
  <ConsoleProviders>
    <ConsoleShell focused intro={intro}>
      {children}
    </ConsoleShell>
  </ConsoleProviders>
);

export default SetupLayout;
