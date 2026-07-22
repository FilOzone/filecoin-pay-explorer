import { Body, Button, Container, Head, Html, Img, Link, Preview, render, Section, Text } from "jsx-email";
import type { JSX } from "react";

interface TemplateProps {
  name: string;
  walletAddress: string;
  verificationUrl: string;
  logoUrl?: string;
  logoIconUrl?: string;
}

const BLUE = "#0090FF";
const DEFAULT_LOGO_URL = `https://docs.filecoin.cloud/cdn-cgi/imagedelivery/GFA1989xA6oUFzvDrgmDow/c9fbc841-a713-447a-11fc-e368b07b0d00/public`;
const DEFAULT_LOGO_ICON_URL = `https://docs.filecoin.cloud/cdn-cgi/imagedelivery/GFA1989xA6oUFzvDrgmDow/d58cface-902c-485d-3e5b-7af570e77f00/public`;

const styles = {
  body: {
    backgroundColor: "#f3f4f6",
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
    margin: "0",
    padding: "0",
  },
  container: {
    maxWidth: "560px",
    margin: "0 auto",
    padding: "40px 20px",
  },
  logoSection: {
    textAlign: "left" as const,
    marginBottom: "20px",
  },
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
  footer: {
    color: "#9ca3af",
    fontSize: "12px",
    lineHeight: "18px",
    textAlign: "center" as const,
    margin: "0",
  },
};

export const previewProps: TemplateProps = {
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
}: TemplateProps): JSX.Element => (
  <Html>
    <Head />
    <Preview>Confirm your email address for Filecoin Onchain Cloud</Preview>
    <Body style={styles.body}>
      <Container style={styles.container}>
        <Section style={styles.logoSection}>
          <Img src={logoUrl} width={140} height={49} alt='Filecoin Onchain Cloud' />
        </Section>

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
        <Text style={styles.footer}>
          Filecoin Onchain Cloud lets you build applications that own their data, payments, and logic.
        </Text>
      </Container>
    </Body>
  </Html>
);

export async function renderVerificationEmail(props: TemplateProps): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(<Template {...props} />),
    render(<Template {...props} />, { plainText: true }),
  ]);
  return { html, text };
}
