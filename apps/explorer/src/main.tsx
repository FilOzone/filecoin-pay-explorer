import { ProgressBar } from "@filecoin-pay/ui/components/progress-bar";
import { Toaster } from "@filecoin-pay/ui/components/sonner";
import { ThemeProvider } from "@filecoin-pay/ui/components/theme-provider";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@filecoin-pay/ui/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import { DEFAULT_THEME, DEFAULT_TOAST_POSITION, THEME_STORAGE_KEY } from "./utils/constants.ts";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme={DEFAULT_THEME} storageKey={THEME_STORAGE_KEY}>
        <BrowserRouter>
          <ProgressBar />
          <App />
          <Toaster position={DEFAULT_TOAST_POSITION} />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
