"use client";

import { Container } from "@filecoin-foundation/ui-filecoin/Container";
import { MobileNavigation } from "@filecoin-foundation/ui-filecoin/Navigation/MobileNavigation";
import { Section, type SectionProps } from "@filecoin-foundation/ui-filecoin/Section/Section";
import { useNavigationItems } from "@/hooks/useNavigationItems";
import { HomeLogoIconLink } from "./components/HomeLogoIconLink";
import { DesktopNavigation } from "./DesktopNavigation";

type NavigationProps = {
  backgroundVariant: SectionProps["backgroundVariant"];
};

function Navigation({ backgroundVariant }: NavigationProps) {
  const { mobileNavigationItems } = useNavigationItems();

  return (
    <Section as='header' backgroundVariant={backgroundVariant}>
      <Container>
        <nav className='flex items-center justify-between py-8 xl:gap-24'>
          <HomeLogoIconLink />

          <div className='block xl:hidden'>
            <MobileNavigation items={mobileNavigationItems} HomeLogoIconLinkComponent={HomeLogoIconLink} />
          </div>

          <div className='hidden xl:block xl:flex-1'>
            <DesktopNavigation />
          </div>
        </nav>
      </Container>
    </Section>
  );
}

export default Navigation;
