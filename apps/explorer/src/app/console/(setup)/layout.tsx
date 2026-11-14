"use client";
import { useSearchParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import ConsoleProviders from "@/components/UserConsole/providers/ConsoleProviders";
import { ConsoleShell } from "../_shell/ConsoleShell";

// Before login the gate replaces the page, so this is all a new user sees of the request.
const Intro = () => {
  const query = useSearchParams();
  return (
    <header className='flex flex-col gap-2'>
      <h1 className='text-3xl font-medium tracking-tight'>Review a storage setup request</h1>
      <p className='max-w-prose text-muted-foreground'>
        Connect the wallet that will pay for storage. Connecting does not authorize this tool. You will review its
        permissions{query.has("pubkey") ? ", encryption access and" : " and"} payment approval separately.
      </p>
    </header>
  );
};

// The console's providers and wallet gate without its navigation: a CLI link
// lands here to review one request, like an OAuth consent page.
const SetupLayout = ({ children }: { children: ReactNode }) => (
  <ConsoleProviders>
    <ConsoleShell
      focused
      intro={
        <Suspense fallback={null}>
          <Intro />
        </Suspense>
      }
    >
      {children}
    </ConsoleShell>
  </ConsoleProviders>
);

export default SetupLayout;
