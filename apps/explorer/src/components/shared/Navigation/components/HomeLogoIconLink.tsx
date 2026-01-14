"use client";

import { useBackgroundVariant } from "@filecoin-foundation/ui-filecoin/Section/Section";
import Link from "next/link";
import useNetwork from "@/hooks/useNetwork";
import LogoDark from "@/public/foc-logo-dark.svg";
import LogoLight from "@/public/foc-logo-light.svg";

export function HomeLogoIconLink() {
  const backgroundVariant = useBackgroundVariant();
  const { network } = useNetwork();

  const Logo = backgroundVariant === "light" ? LogoDark : LogoLight;
  return (
    <Link href={`/${network}`} className='focus:brand-outline inline-block' aria-label='Go to homepage'>
      <Logo height={40} />
      <span className='sr-only'>Home</span>
    </Link>
  );
}
