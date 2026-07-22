import { Body, Button, Column, Container, Head, Hr, Html, Preview, Row, render, Section, Text } from "jsx-email";
import type { JSX } from "react";
import { BLUE, DEFAULT_LOGO_ICON_URL, DEFAULT_LOGO_URL, sharedStyles } from "../common/constants";
import { EmailFooter } from "../common/EmailFooter";
import { EmailHeader } from "../common/EmailHeader";

export type AlertLevel = "warning" | "critical" | "emergency";

export interface AlertEmailProps {
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

const ALERT_CONFIG = {
  warning: {
    borderColor: "#F59E0B",
    badgeBg: "#FEF3C7",
    badgeColor: "#92400E",
    badgeText: "Warning",
    title: "Your account needs attention",
    previewText: "Heads up — your Filecoin Pay account is running low on funds.",
    description:
      "Your services are funded, but your runway is shorter than recommended. Topping up now ensures uninterrupted service.",
  },
  critical: {
    borderColor: "#F97316",
    badgeBg: "#FECAB5",
    badgeColor: "#9A3412",
    badgeText: "Critical",
    title: "Urgent action required",
    previewText: "Your Filecoin Pay account will run out of funds in less than 7 days.",
    description:
      "Your account funding is critically low. Please top-up immediately to avoid disruption to your services. After ~7 days, service providers may begin removing your data due to lack of payment.",
  },
  emergency: {
    borderColor: "#DC2626",
    badgeBg: "#FEE2E2",
    badgeColor: "#7F1D1D",
    badgeText: "Emergency",
    title: "Service terminating imminently",
    previewText: "Emergency — your Filecoin Pay services will terminate in less than 3 days.",
    description:
      "Your account has less than 3 days of available funding. Providers will begin terminating services imminently unless you add additional funds. Top up now to keep them running.",
  },
} as const;

const styles = {
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
    textAlign: "justify" as const,
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
};

export const previewProps: AlertEmailProps = {
  name: "Ada Lovelace",
  walletAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  alertLevel: "emergency",
  fundedUntil: "January 15, 2026",
  daysRemaining: 6,
  topUpAmount: "10 USDFC",
  topUpUrl: "https://example.com/console",
  logoUrl: DEFAULT_LOGO_URL,
  logoIconUrl: DEFAULT_LOGO_ICON_URL,
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
}: AlertEmailProps): JSX.Element => {
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
      <Body style={sharedStyles.body}>
        <Container style={sharedStyles.container}>
          <EmailHeader logoUrl={logoUrl} />

          <Section style={cardStyle}>
            <Text style={{ ...styles.badge, color: config.badgeColor, backgroundColor: config.badgeBg }}>
              {config.badgeText}
            </Text>

            <Text style={styles.title}>{config.title}</Text>

            <Text style={styles.greeting}>
              Hi <strong>{name}</strong>,
            </Text>
            <Text style={styles.description}>{config.description}</Text>

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

          <EmailFooter logoIconUrl={logoIconUrl} />
        </Container>
      </Body>
    </Html>
  );
};

export async function renderAlertEmail(props: AlertEmailProps): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(<Template {...props} />),
    render(<Template {...props} />, { plainText: true }),
  ]);
  return { html, text };
}
