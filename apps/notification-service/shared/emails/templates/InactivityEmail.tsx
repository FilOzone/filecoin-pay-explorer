import { Body, Button, Column, Container, Head, Hr, Html, Link, Preview, Row, render, Section, Text } from "jsx-email";
import type { JSX } from "react";
import { BLUE, DEFAULT_LOGO_ICON_URL, DEFAULT_LOGO_URL, sharedStyles } from "../common/constants";
import { EmailFooter } from "../common/EmailFooter";
import { EmailHeader } from "../common/EmailHeader";

export interface InactiveDataSetRow {
  dataSetId: string;
  daysInactive: number;
  monthlySpend: string; // formatted, e.g. "1.25 USDFC"
  url: string;
}

export interface InactivityEmailProps {
  name: string;
  walletAddress: string;
  /** The datasets to list, most costly first. */
  dataSets: InactiveDataSetRow[];
  /** Newly inactive datasets not listed. */
  moreCount: number;
  queueUrl: string;
  logoUrl?: string;
  logoIconUrl?: string;
}

const styles = {
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    padding: "40px 48px",
  },
  title: {
    color: "#111827",
    fontSize: "22px",
    fontWeight: "700",
    textAlign: "center" as const,
    margin: "0 0 20px",
    lineHeight: "30px",
  },
  text: {
    color: "#374151",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  listBlock: {
    backgroundColor: "#f9fafb",
    borderRadius: "8px",
    padding: "16px 20px",
    margin: "8px 0 24px",
  },
  dataSetLink: {
    color: "#5AAAD6",
    fontSize: "15px",
    fontWeight: "600",
  },
  dataSetDetail: {
    color: "#6b7280",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "2px 0 0",
  },
  divider: {
    borderColor: "#e5e7eb",
    margin: "12px 0",
  },
  button: {
    fontWeight: "600",
  },
  note: {
    color: "#9ca3af",
    fontSize: "13px",
    lineHeight: "20px",
    textAlign: "center" as const,
    margin: "20px 0 0",
  },
};

function subject(total: number): string {
  return total === 1
    ? "One of your datasets has had no new data for 30 days"
    : `${total} of your datasets have had no new data for 30 days`;
}

export const previewProps: InactivityEmailProps = {
  name: "Ada Lovelace",
  walletAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  dataSets: [
    { dataSetId: "12", daysInactive: 45, monthlySpend: "1.25 USDFC", url: "https://example.com/console" },
    { dataSetId: "7", daysInactive: 31, monthlySpend: "0.4 USDFC", url: "https://example.com/console" },
  ],
  moreCount: 3,
  queueUrl: "https://example.com/console",
  logoUrl: DEFAULT_LOGO_URL,
  logoIconUrl: DEFAULT_LOGO_ICON_URL,
};

export const templateName = "InactivityEmail";

export const Template = ({
  name,
  walletAddress,
  dataSets,
  moreCount,
  queueUrl,
  logoUrl = DEFAULT_LOGO_URL,
  logoIconUrl = DEFAULT_LOGO_ICON_URL,
}: InactivityEmailProps): JSX.Element => (
  <Html>
    <Head />
    <Preview>You are still paying to store datasets that have had no new data for 30 days.</Preview>
    <Body style={sharedStyles.body}>
      <Container style={sharedStyles.container}>
        <EmailHeader logoUrl={logoUrl} />

        <Section style={styles.card}>
          <Text style={styles.title}>Inactive datasets</Text>
          <Text style={styles.text}>
            Hi <strong>{name}</strong>,
          </Text>
          <Text style={styles.text}>
            These Warm Storage datasets for wallet {walletAddress} have had no new data for at least 30 days. You are
            still paying to store them. Review them in your console: choosing Keep on a dataset pauses these emails for
            it.
          </Text>

          <Section style={styles.listBlock}>
            {dataSets.map((dataSet, index) => (
              <Row key={dataSet.dataSetId}>
                <Column>
                  {index > 0 ? <Hr style={styles.divider} /> : null}
                  <Link href={dataSet.url} style={styles.dataSetLink}>
                    Dataset #{dataSet.dataSetId}
                  </Link>
                  <Text style={styles.dataSetDetail}>
                    {dataSet.daysInactive} days inactive · {dataSet.monthlySpend} per month
                  </Text>
                </Column>
              </Row>
            ))}
            {moreCount > 0 ? (
              <Row>
                <Column>
                  <Hr style={styles.divider} />
                  <Text style={styles.dataSetDetail}>
                    and {moreCount} more {moreCount === 1 ? "dataset" : "datasets"}
                  </Text>
                </Column>
              </Row>
            ) : null}
          </Section>

          <Button
            align='center'
            backgroundColor={BLUE}
            borderRadius={8}
            fontSize={14}
            height={44}
            width={220}
            href={queueUrl}
            textColor='#ffffff'
            style={styles.button}
          >
            Review inactive datasets
          </Button>

          <Text style={styles.note}>You get this email once each time a dataset goes 30 days without new data.</Text>
        </Section>

        <EmailFooter logoIconUrl={logoIconUrl} />
      </Container>
    </Body>
  </Html>
);

export async function renderInactivityEmail(
  props: InactivityEmailProps,
): Promise<{ subject: string; html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(<Template {...props} />),
    render(<Template {...props} />, { plainText: true }),
  ]);
  return { subject: subject(props.dataSets.length + props.moreCount), html, text };
}
