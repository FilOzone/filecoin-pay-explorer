import { EmailMessage } from "cloudflare:email";

/** From-address for all outbound mail; must be an allowed sender on the EMAIL binding. */
export const FROM_EMAIL = "noreply@filecoin.cloud";
export const FROM_NAME = "Filecoin Onchain Cloud";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Assembles a `multipart/alternative` MIME message (plain text + HTML) — the raw
 * form the Cloudflare `send_email` binding requires.
 */
export function buildMimeEmail({
  from,
  fromName,
  to,
  subject,
  html,
  text,
}: {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): string {
  const boundary = `b${crypto.randomUUID().replace(/-/g, "")}`;
  return [
    `From: ${fromName} <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
    "",
    `--${boundary}--`,
  ].join("\r\n");
}

/** Sends a transactional email through the Cloudflare EMAIL (`send_email`) binding. */
export async function sendEmail(binding: SendEmail, email: OutgoingEmail): Promise<void> {
  const message = new EmailMessage(
    FROM_EMAIL,
    email.to,
    buildMimeEmail({ from: FROM_EMAIL, fromName: FROM_NAME, ...email }),
  );
  await binding.send(message);
}
