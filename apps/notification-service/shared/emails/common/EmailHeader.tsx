import { Img, Section } from "jsx-email";
import type { JSX } from "react";
import { DEFAULT_LOGO_URL } from "./constants";

interface EmailHeaderProps {
  logoUrl?: string;
}

export const EmailHeader = ({ logoUrl = DEFAULT_LOGO_URL }: EmailHeaderProps): JSX.Element => (
  <Section style={{ textAlign: "left" as const, marginBottom: "20px" }}>
    <Img src={logoUrl} width={140} height={49} alt='Filecoin Onchain Cloud' />
  </Section>
);
