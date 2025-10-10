import { ProgressBar } from "@filecoin-pay/ui/components/progress-bar";
import { ThemeProvider } from "@filecoin-pay/ui/components/theme-provider";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@filecoin-pay/ui/globals.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme='system' storageKey='vite-ui-theme'>
      <BrowserRouter>
        <ProgressBar />
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
