"use client";

import { useBackground } from "@filecoin-foundation/ui-filecoin/Section/Section";
import Link from "next/link";
import useNetwork from "@/hooks/useNetwork";
import LogoDark from "@/public/foc-logo-dark.svg";
import LogoLight from "@/public/foc-logo-light.svg";

export function HomeLogoIconLink() {
  const { network } = useNetwork();
  const backgroundVariant = useBackground();

  const Logo = backgroundVariant.theme === "light" ? LogoDark : LogoLight;
  return (
    <Link href={`/${network}`} className='focus:brand-outline inline-block' aria-label='Go to homepage'>
      <Logo height={40} />
      <span className='sr-only'>Home</span>
    </Link>
  );
}
