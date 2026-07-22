import { Img, Link, Section, Text } from "jsx-email";
import type { JSX } from "react";
import { BLUE, DEFAULT_LOGO_ICON_URL } from "./constants";

interface EmailFooterProps {
  logoIconUrl?: string;
}

export const EmailFooter = ({ logoIconUrl = DEFAULT_LOGO_ICON_URL }: EmailFooterProps): JSX.Element => (
  <>
    <Section style={{ textAlign: "center" as const, margin: "24px 0 6px" }}>
      <Img
        src={logoIconUrl}
        width={16}
        height={16}
        alt=''
        style={{ display: "inline", verticalAlign: "middle", marginRight: "5px" }}
      />
      <Link href='https://filecoin.cloud' style={{ color: BLUE, fontSize: "13px", verticalAlign: "middle" }}>
        filecoin.cloud
      </Link>
    </Section>
    <Text
      style={{
        color: "#9ca3af",
        fontSize: "12px",
        lineHeight: "18px",
        textAlign: "center" as const,
        margin: "0",
      }}
    >
      Filecoin Onchain Cloud lets you build applications that own their data, payments, and logic.
    </Text>
  </>
);
