import { Container } from "@filecoin-foundation/ui-filecoin/Container";
import { LegalSection } from "@filecoin-foundation/ui-filecoin/Footer/LegalSection";
import { Section } from "@filecoin-foundation/ui-filecoin/Section/Section";
import { PATHS } from "@/constants/paths";
import { BASE_DOMAIN, FIL_OZ_URL, FILECOIN_FOUNDATION_URL, FOC_URLS } from "@/constants/site-metadata";
import FilecoinFoundationLogo from "@/public/filecoin-foundation-logo.svg";
import FilozLogo from "@/public/filoz-logo.svg";

const legalLinks = [
  {
    label: PATHS.PRIVACY_POLICY.label,
    href: `${FOC_URLS.filecoinCloud}${PATHS.PRIVACY_POLICY.path}`,
  },
  { label: PATHS.TERMS_OF_USE.label, href: `${FOC_URLS.filecoinCloud}${PATHS.TERMS_OF_USE.path}` },
];

function Footer() {
  return (
    <Section as='footer' backgroundVariant='dark'>
      <Container>
        <LegalSection
          baseDomain={BASE_DOMAIN}
          legalItems={legalLinks}
          creators={[
            {
              companyName: "FilOz",
              websiteUrl: FIL_OZ_URL,
              LogoComponent: FilozLogo,
            },
            {
              companyName: "Filecoin Foundation",
              websiteUrl: FILECOIN_FOUNDATION_URL,
              LogoComponent: FilecoinFoundationLogo,
            },
          ]}
        />
      </Container>
    </Section>
  );
}

export default Footer;
