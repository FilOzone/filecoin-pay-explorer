import { Container } from "@filecoin-foundation/ui-filecoin/Container";
import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "@/public/foc-logo-dark.svg";

type ConsoleHeaderProps = {
  /** Small status beside the logo, such as the console's beta badge. */
  badge?: ReactNode;
  /**
   * Wallet controls for the right-hand side. Only the gated console shell passes
   * these — the header itself must render without wagmi/RainbowKit providers so
   * ungated pages (e.g. the email verification landing page) can reuse it.
   */
  walletControls?: ReactNode;
  /**
   * Trigger for the mobile navigation drawer. Ungated pages that reuse this
   * header (e.g. the email verification landing page) pass none.
   */
  navTrigger?: ReactNode;
};

export const ConsoleHeader = ({ badge, walletControls, navTrigger }: ConsoleHeaderProps) => (
  <header className='bg-background'>
    <Container>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-8 py-8 md:flex-nowrap md:gap-x-4'>
        <div className='mr-auto flex shrink-0 items-center gap-3'>
          <Link href='/' aria-label='Go to homepage' className='focus:brand-outline inline-block shrink-0'>
            <Logo height={40} />
          </Link>
          {badge}
        </div>

        {navTrigger ? <div className='order-2 shrink-0 md:order-3 lg:hidden'>{navTrigger}</div> : null}

        {walletControls ? (
          <div className='order-3 flex w-full items-center gap-2 md:order-2 md:w-auto md:gap-3'>{walletControls}</div>
        ) : null}
      </div>
    </Container>
  </header>
);
