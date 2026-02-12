"use client";

import { setUIConfig } from "@filecoin-foundation/ui-filecoin/config/ui-config";
import { ProgressBar } from "@filecoin-pay/ui/components/progress-bar";
import { Toaster } from "@filecoin-pay/ui/components/sonner";
import { TooltipProvider } from "@filecoin-pay/ui/components/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { BASE_DOMAIN } from "@/constants/site-metadata";
import { NetworkProvider } from "@/context/Network";
import { DEFAULT_TOAST_POSITION } from "@/utils/constants";

setUIConfig({
  baseDomain: BASE_DOMAIN,
  Link,
});

const queryClient = new QueryClient();

const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <NetworkProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ProgressBar />
          {children}
          <Toaster
            position={DEFAULT_TOAST_POSITION}
            toastOptions={{
              style: {
                "--normal-bg": "var(--color-card-background-hover)",
                "--normal-text": "var(--color-text-base)",
                "--normal-border": "var(--color-border-base)",
                "--border-radius": "var(--radius)",
              } as React.CSSProperties,
            }}
          />
        </TooltipProvider>
      </QueryClientProvider>
    </NetworkProvider>
  );
};

export default Providers;
