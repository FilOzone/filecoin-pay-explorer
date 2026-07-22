import { Body, Button, Container, Head, Html, Preview, render, Section, Text } from "jsx-email";
import type { JSX } from "react";
import { BLUE, DEFAULT_LOGO_ICON_URL, DEFAULT_LOGO_URL, sharedStyles } from "../common/constants";
import { EmailFooter } from "../common/EmailFooter";
import { EmailHeader } from "../common/EmailHeader";

export interface VerificationEmailProps {
  name: string;
  walletAddress: string;
  verificationUrl: string;
  logoUrl?: string;
  logoIconUrl?: string;
}

const styles = {
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "10px",
    border: `1px solid ${BLUE}`,
    padding: "40px 48px",
  },
  title: {
    color: "#111827",
    fontSize: "22px",
    fontWeight: "700",
    textAlign: "center" as const,
    margin: "0 0 28px",
    lineHeight: "30px",
  },
  greeting: {
    color: "#374151",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 8px",
  },
  bodyText: {
    color: "#374151",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 24px",
    textAlign: "justify" as const,
  },
  button: {
    fontWeight: "600",
  },
  postButton: {
    color: "#6b7280",
    fontSize: "14px",
    lineHeight: "22px",
    textAlign: "center" as const,
    margin: "24px 0 0",
  },
};

export const previewProps: VerificationEmailProps = {
  name: "Ada Lovelace",
  walletAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  verificationUrl: "https://example.com/verify?token=abc123",
  logoUrl: DEFAULT_LOGO_URL,
  logoIconUrl: DEFAULT_LOGO_ICON_URL,
};

export const templateName = "VerificationEmail";

export const Template = ({
  name,
  walletAddress,
  verificationUrl,
  logoUrl = DEFAULT_LOGO_URL,
  logoIconUrl = DEFAULT_LOGO_ICON_URL,
}: VerificationEmailProps): JSX.Element => (
  <Html>
    <Head />
    <Preview>Confirm your email address for Filecoin Onchain Cloud</Preview>
    <Body style={sharedStyles.body}>
      <Container style={sharedStyles.container}>
        <EmailHeader logoUrl={logoUrl} />

        <Section style={styles.card}>
          <Text style={styles.title}>Confirm your email address</Text>
          <Text style={styles.greeting}>
            Hi <strong>{name}</strong>,
          </Text>
          <Text style={styles.bodyText}>To complete your registration we need to verify your email address.</Text>
          <Button
            align='center'
            backgroundColor={BLUE}
            borderRadius={8}
            fontSize={14}
            height={44}
            width={200}
            href={verificationUrl}
            textColor='#ffffff'
            style={styles.button}
          >
            Verify email address
          </Button>
          <Text style={styles.postButton}>
            Once verified, you'll receive email alerts when your wallet:
            <br />
            <span style={{ fontFamily: "monospace", fontSize: "13px", color: "#5AAAD6" }}>{walletAddress}</span>
            <br />
            is running low on funds.
          </Text>
        </Section>

        <EmailFooter logoIconUrl={logoIconUrl} />
      </Container>
    </Body>
  </Html>
);

export async function renderVerificationEmail(props: VerificationEmailProps): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(<Template {...props} />),
    render(<Template {...props} />, { plainText: true }),
  ]);
  return { html, text };
}
