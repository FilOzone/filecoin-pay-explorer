import { createDb } from "../shared/db/client";
import type { AlertLevel } from "../shared/db/schema";
import { FROM_EMAIL, FROM_NAME } from "../shared/emails/config";
import { type AlertEmailProps, renderAlertEmail } from "../shared/emails/templates/AlertEmail";
import type { AlertMessage } from "../shared/messages";
import {
  type AccountSummary,
  DEFAULT_HEALTH_THRESHOLDS,
  deriveAccountHealth,
  type ReadClient,
  readAccountSummary,
} from "./account";
import { buildAlertContent } from "./alert-content";
import { clearAlertState, getAlertState, recordSent, shouldSend } from "./dedup";
import { findSubscriberEmail } from "./queries";

/** What the queue handler should do with the message. */
export type MessageAction = "ack" | "retry";

/** A rendered alert ready for the email binding. */
export type OutboundEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * The two external boundaries, injected so tests can mock RPC + email while D1
 * and KV run for real.
 */
export type ProcessDeps = {
  readSummary: (client: ReadClient, wallet: string) => Promise<AccountSummary>;
  sendEmail: (env: Env, message: OutboundEmail) => Promise<void>;
};

export const defaultDeps: ProcessDeps = {
  readSummary: readAccountSummary,
  sendEmail: sendAlertEmail,
};

const SUBJECTS: Record<AlertLevel, string> = {
  warning: "Your Filecoin Pay account is running low",
  critical: "Action required: your Filecoin Pay funds are critically low",
  emergency: "Urgent: your Filecoin Pay services will stop soon",
};

/**
 * Processes one alert message end to end and returns whether to ack or retry.
 * Never throws: transient failures (RPC read, email send) return "retry" so the
 * queue redelivers just this message, without disturbing the rest of the batch.
 */
export async function processMessage(
  env: Env,
  client: ReadClient,
  body: AlertMessage,
  deps: ProcessDeps = defaultDeps,
): Promise<MessageAction> {
  const wallet = body.walletAddress.toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const db = createDb(env.DB);

  let summary: AccountSummary;
  try {
    summary = await deps.readSummary(client, wallet);
  } catch (error) {
    log("read_failed", { wallet, error });
    return "retry";
  }

  const health = deriveAccountHealth(summary, DEFAULT_HEALTH_THRESHOLDS);

  // Recovered (or never at risk): reset dedup so a later relapse alerts again.
  if (health.tier === "healthy") {
    await clearAlertState(env.KV, wallet);
    return "ack";
  }
  const tier = health.tier;

  // Suppress if we already alerted this incident within the tier's window.
  if (!shouldSend(await getAlertState(env.KV, wallet), tier, nowSec)) {
    return "ack";
  }

  // Unsubscribed between scheduling and now → nothing to send.
  const subscriber = await findSubscriberEmail(db, wallet);
  if (!subscriber) return "ack";

  const content = buildAlertContent(summary, health, DEFAULT_HEALTH_THRESHOLDS, nowSec);
  const props: AlertEmailProps = {
    name: subscriber.name,
    walletAddress: wallet,
    alertLevel: tier,
    fundedUntil: content.fundedUntil,
    daysRemaining: content.daysRemaining,
    topUpAmount: content.topUpAmount,
    topUpUrl: `${env.FRONTEND_ORIGIN}/console`,
  };
  const { html, text } = await renderAlertEmail(props);

  try {
    await deps.sendEmail(env, { to: subscriber.email, subject: SUBJECTS[tier], html, text });
  } catch (error) {
    log("send_failed", { wallet, tier, error });
    return "retry";
  }

  // Email is out; record it. A failure here can't un-send, so ack rather than
  // retry (which would re-send). Worst case the next 12h tick re-alerts.
  try {
    await recordSent(env.KV, db, {
      tier,
      wallet,
      fundedUntilSec: content.fundedUntilSec,
      sentAtSec: nowSec,
      emailSentTo: subscriber.email,
    });
  } catch (error) {
    log("record_failed", { wallet, tier, error });
  }

  return "ack";
}

/** Sends via the Cloudflare Email binding using the shared from-address. */
async function sendAlertEmail(env: Env, message: OutboundEmail): Promise<void> {
  await env.EMAIL.send({
    to: message.to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}

function log(event: string, fields: { wallet: string; tier?: AlertLevel; error?: unknown }): void {
  console.error(
    JSON.stringify({
      event: `processor.${event}`,
      wallet: fields.wallet,
      tier: fields.tier,
      error: fields.error instanceof Error ? fields.error.message : fields.error ? String(fields.error) : undefined,
    }),
  );
}
