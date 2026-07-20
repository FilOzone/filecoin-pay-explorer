import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  render,
  Section,
  Text,
} from "jsx-email";
import type { JSX } from "react";

export type AlertLevel = "warning" | "critical" | "emergency";

interface TemplateProps {
  name: string;
  walletAddress: string;
  alertLevel: AlertLevel;
  fundedUntil: string; // formatted date, e.g. "January 15, 2026"
  daysRemaining: number;
  topUpAmount: string; // e.g. "120 USDFC"
  topUpUrl: string;
  logoUrl?: string;
  logoIconUrl?: string;
}

const BLUE = "#0090FF";
const DEFAULT_BASE_URL = "https://filecoin.cloud";
const DEFAULT_LOGO_URL = `${DEFAULT_BASE_URL}/foc-logo-dark.png`;
const DEFAULT_LOGO_ICON_URL = `${DEFAULT_BASE_URL}/foc-logo-icon.svg`;

const ALERT_CONFIG = {
  warning: {
    borderColor: "#F59E0B",
    badgeBg: "#FEF3C7",
    badgeColor: "#92400E",
    badgeText: "Warning",
    title: "Your account needs attention",
    previewText: "Heads up — your Filecoin Pay account is running low on funds.",
    description:
      "Your storage services are funded, but your runway is shorter than recommended. Topping up now ensures uninterrupted service.",
  },
  critical: {
    borderColor: "#F97316",
    badgeBg: "#FECAB5",
    badgeColor: "#9A3412",
    badgeText: "Critical",
    title: "Urgent action required",
    previewText: "Your Filecoin Pay account will run out of funds in less than 7 days.",
    description:
      "Your account funding is critically low. Please top-up immediately to avoid disruption to your storage services. After ~7 days, service providers may begin removing your data due to lack of payment.",
  },
  emergency: {
    borderColor: "#DC2626",
    badgeBg: "#FEE2E2",
    badgeColor: "#7F1D1D",
    badgeText: "Emergency",
    title: "Service terminating imminently",
    previewText: "Emergency — your Filecoin Pay storage services will terminate in less than 3 days.",
    description:
      "Your account has less than 3 days of available funding. Storage providers will begin terminating services imminently unless you add additional funds. Top up immediately to prevent data loss.",
  },
} as const;

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
  badge: {
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    textAlign: "center" as const,
    margin: "0 0 20px",
    padding: "5px 0",
    borderRadius: "6px",
  },
  title: {
    color: "#111827",
    fontSize: "22px",
    fontWeight: "700",
    textAlign: "center" as const,
    margin: "0 0 20px",
    lineHeight: "30px",
  },
  greeting: {
    color: "#374151",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 8px",
  },
  description: {
    color: "#374151",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 24px",
  },
  infoBlock: {
    backgroundColor: "#f9fafb",
    borderRadius: "8px",
    padding: "16px 20px",
    margin: "0 0 24px",
  },
  infoLabel: {
    color: "#9ca3af",
    fontSize: "11px",
    fontWeight: "600",
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    margin: "0 0 4px",
    lineHeight: "16px",
  },
  infoValue: {
    color: "#111827",
    fontSize: "15px",
    fontWeight: "600",
    margin: "0",
    lineHeight: "22px",
  },
  walletValue: {
    color: "#5AAAD6",
    fontSize: "13px",
    fontFamily: "monospace",
    margin: "0",
    lineHeight: "20px",
  },
  infoDivider: {
    borderColor: "#e5e7eb",
    margin: "12px 0",
  },
  button: {
    fontWeight: "600",
  },
  ignoreNote: {
    color: "#9ca3af",
    fontSize: "13px",
    lineHeight: "20px",
    textAlign: "center" as const,
    margin: "20px 0 0",
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
  alertLevel: "emergency",
  fundedUntil: "January 15, 2026",
  daysRemaining: 6,
  topUpAmount: "10 USDFC",
  topUpUrl: "https://example.com/console",
  logoUrl: "http://localhost:3000/foc-logo-dark.svg",
  logoIconUrl: "http://localhost:3000/foc-logo-icon.svg",
};

export const templateName = "AlertEmail";

export const Template = ({
  name,
  walletAddress,
  alertLevel,
  fundedUntil,
  daysRemaining,
  topUpAmount,
  topUpUrl,
  logoUrl = DEFAULT_LOGO_URL,
  logoIconUrl = DEFAULT_LOGO_ICON_URL,
}: TemplateProps): JSX.Element => {
  const config = ALERT_CONFIG[alertLevel];
  const cardStyle = {
    backgroundColor: "#ffffff",
    borderRadius: "10px",
    border: `1px solid ${config.borderColor}`,
    padding: "40px 48px",
  };

  return (
    <Html>
      <Head />
      <Preview>{config.previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.logoSection}>
            <Img src={logoUrl} width={140} height={49} alt='Filecoin Onchain Cloud' />
          </Section>

          <Section style={cardStyle}>
            {/* Level badge */}
            <Text style={{ ...styles.badge, color: config.badgeColor, backgroundColor: config.badgeBg }}>
              {config.badgeText}
            </Text>

            <Text style={styles.title}>{config.title}</Text>

            <Text style={styles.greeting}>
              Hi <strong>{name}</strong>,
            </Text>
            <Text style={styles.description}>{config.description}</Text>

            {/* Info block */}
            <Section style={styles.infoBlock}>
              <Row>
                <Column>
                  <Text style={styles.infoLabel}>Monitored wallet</Text>
                  <Text style={styles.walletValue}>{walletAddress}</Text>
                </Column>
              </Row>
              <Row>
                <Column>
                  <Hr style={styles.infoDivider} />
                </Column>
              </Row>
              <Row>
                <Column style={{ paddingRight: "16px" }}>
                  <Text style={styles.infoLabel}>Funded until</Text>
                  <Text style={styles.infoValue}>{fundedUntil}</Text>
                  <Text
                    style={{
                      color: config.badgeColor,
                      fontSize: "12px",
                      fontWeight: "600",
                      margin: "3px 0 0",
                      lineHeight: "18px",
                    }}
                  >
                    {daysRemaining} {daysRemaining === 1 ? "day" : "days"} remaining
                  </Text>
                </Column>
                <Column>
                  <Text style={styles.infoLabel}>Recommended top-up</Text>
                  <Text style={styles.infoValue}>{topUpAmount}</Text>
                </Column>
              </Row>
            </Section>

            <Button
              align='center'
              backgroundColor={BLUE}
              borderRadius={8}
              fontSize={14}
              height={44}
              width={200}
              href={topUpUrl}
              textColor='#ffffff'
              style={styles.button}
            >
              Top up now
            </Button>

            <Text style={styles.ignoreNote}>If you've already topped up, you can safely ignore this email.</Text>
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
};

export async function renderAlertEmail(props: TemplateProps): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(<Template {...props} />),
    render(<Template {...props} />, { plainText: true }),
  ]);
  return { html, text };
}
