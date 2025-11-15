import { clsx } from "clsx";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { Footer, Navigation, Providers } from "@/components/shared";

const funnelSans = localFont({
  src: "../../fonts/Funnel_Sans/FunnelSans[wght].woff2",
  display: "swap",
  variable: "--font-funnel-sans",
  fallback: ["Arial", "Helvetica", "sans-serif"],
  preload: true,
});

const aspekta = localFont({
  src: "../../fonts/Aspekta/AspektaVF.woff2",
  display: "swap",
  variable: "--font-aspekta",
  fallback: ["Arial", "Helvetica", "sans-serif"],
  preload: true,
});

type SiteLayoutProps = Readonly<{ children: ReactNode }>;

function SiteLayout({ children }: SiteLayoutProps) {
  return (
    <html lang='en'>
      <body
        className={clsx(
          funnelSans.variable,
          aspekta.variable,
          "relative flex min-h-screen flex-col font-sans antialiased bg-zinc-950 text-zinc-50",
        )}
      >
        <Providers>
          <Navigation backgroundVariant='light' />
          <main className='flex-1'>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

export default SiteLayout;
