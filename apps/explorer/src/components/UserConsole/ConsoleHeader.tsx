import { Container } from "@filecoin-foundation/ui-filecoin/Container";
import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "@/public/foc-logo-dark.svg";

type ConsoleHeaderProps = {
  /**
   * Wallet controls for the right-hand side. Only the gated console shell passes
   * these — the header itself must render without wagmi/RainbowKit providers so
   * ungated pages (e.g. the email verification landing page) can reuse it.
   */
  walletControls?: ReactNode;
};

export const ConsoleHeader = ({ walletControls }: ConsoleHeaderProps) => (
  <header className='bg-background'>
    <Container>
      <div className='flex flex-col gap-8 py-8 sm:flex-row sm:items-center sm:justify-between sm:gap-24'>
        <Link href='/' aria-label='Go to homepage' className='focus:brand-outline inline-block'>
          <Logo height={40} />
        </Link>

        {walletControls ? (
          <div className='flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-4'>
            {walletControls}
          </div>
        ) : null}
      </div>
    </Container>
  </header>
);
