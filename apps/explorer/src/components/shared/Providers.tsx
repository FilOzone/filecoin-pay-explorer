"use client";
import { ProgressBar } from "@filecoin-pay/ui/components/progress-bar";
import { Toaster } from "@filecoin-pay/ui/components/sonner";
import { TooltipProvider } from "@filecoin-pay/ui/components/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEFAULT_TOAST_POSITION } from "@/utils/constants";

const queryClient = new QueryClient();

const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ProgressBar />
        {children}
        <Toaster position={DEFAULT_TOAST_POSITION} />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default Providers;
