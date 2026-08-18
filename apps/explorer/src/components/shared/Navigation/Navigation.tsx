"use client";

import { Container } from "@filecoin-foundation/ui-filecoin/Container";
import { MobileNavigation } from "@filecoin-foundation/ui-filecoin/Navigation/MobileNavigation";
import { Section, type SectionProps } from "@filecoin-foundation/ui-filecoin/Section/Section";
import { useNavigationItems } from "@/hooks/useNavigationItems";
import { HomeLogoIconLink } from "./components/HomeLogoIconLink";
import NetworkOptions from "./components/NetworkOptions";
import { DesktopNavigation } from "./DesktopNavigation";

type NavigationProps = {
  backgroundVariant: SectionProps["backgroundVariant"];
};

function Navigation({ backgroundVariant }: NavigationProps) {
  const { mobileNavigationItems } = useNavigationItems();

  return (
    <Section as='header' backgroundVariant={backgroundVariant}>
      <Container>
        <nav className='flex flex-col gap-8 py-8 xl:flex-row xl:items-center xl:justify-between xl:gap-24'>
          <div className='flex w-full items-center justify-between xl:w-auto'>
            <HomeLogoIconLink />

            <div className='block xl:hidden'>
              <MobileNavigation items={mobileNavigationItems} HomeLogoIconLinkComponent={HomeLogoIconLink} />
            </div>
          </div>

          <div className='block w-full -mb-12 xl:hidden'>
            <NetworkOptions />
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
