import { clsx } from "clsx";
import localFont from "next/font/local";
import Script from "next/script";
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
      <Script async defer src='https://plausible.io/js/pa-69jF95tDk97_PjEsmdMd6.js' />
      <Script
        id='next-plausible-init'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: plausible init script
        dangerouslySetInnerHTML={{
          __html: `window.plausible = window.plausible || function() { (plausible.q=plausible.q||[]).push(arguments) }, plausible.init = plausible.init || function(i) { plausible.o = i || {} }; plausible.init()`,
        }}
      />
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
