import { createError, type createLogger } from "evlog";
import type { DB } from "../shared/db/client";
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

export interface ProcessorFields {
  outcome: string;
  action: string;
  health: { tier: string; runwayDays: number };
  alert: { tier: string; daysRemaining: number; fundedUntilSec: number };
}

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

/**
 * Processes one already-validated alert message and returns whether to ack or
 * retry. Does not throw — every failure maps to an action: transient errors
 * (RPC read, email send, or anything unexpected) return "retry"; a failure to
 * record after the email is sent still acks, to avoid re-sending.
 */
export async function processMessage(
  env: Env,
  client: ReadClient,
  db: DB,
  body: AlertMessage,
  log: ReturnType<typeof createLogger<ProcessorFields>>,
  deps: ProcessDeps = defaultDeps,
): Promise<MessageAction> {
  const wallet = body.walletAddress.toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);

  try {
    let summary: AccountSummary;
    try {
      summary = await deps.readSummary(client, wallet);
    } catch (cause) {
      log.error(
        createError({
          message: "Failed to read account state from chain",
          why: "RPC call to FilecoinPayV1 failed — node may be unreachable or the contract call reverted",
          fix: "Check RPC_URL secret and NETWORK binding; the message will be retried",
          internal: { wallet },
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        }),
      );
      return "retry";
    }

    const health = deriveAccountHealth(summary, DEFAULT_HEALTH_THRESHOLDS);
    log.set({ health: { tier: health.tier, runwayDays: health.runwayDays } });

    // Recovered (or never at risk): reset dedup so a later relapse alerts again.
    if (health.tier === "healthy") {
      await clearAlertState(env.KV, wallet);
      log.set({ outcome: "healthy" });
      return "ack";
    }
    const tier = health.tier;

    // Suppress if we already alerted this incident within the tier's window.
    if (!shouldSend(await getAlertState(env.KV, wallet), tier, nowSec)) {
      log.set({ outcome: "suppressed" });
      return "ack";
    }

    // Unsubscribed between scheduling and now → nothing to send.
    const subscriber = await findSubscriberEmail(db, wallet);
    if (!subscriber) {
      log.set({ outcome: "no_subscriber" });
      return "ack";
    }

    const content = buildAlertContent(summary, health, nowSec);
    log.set({ alert: { tier, daysRemaining: content.daysRemaining, fundedUntilSec: content.fundedUntilSec } });
    const props: AlertEmailProps = {
      name: subscriber.name,
      walletAddress: wallet,
      alertLevel: tier,
      fundedUntil: content.fundedUntil,
      daysRemaining: content.daysRemaining,
      topUpUrl: `${env.FRONTEND_ORIGIN}/console`,
    };
    const { subject, html, text } = await renderAlertEmail(props);

    try {
      await deps.sendEmail(env, { to: subscriber.email, subject, html, text });
    } catch (cause) {
      const code: string = (cause as { code?: string }).code ?? "UNKNOWN";
      const action = classifyEmailError(code);
      log.error(
        createError({
          message: "Failed to send alert email",
          why: cause instanceof Error ? cause.message : String(cause),
          fix:
            action === "retry"
              ? "The message will be retried automatically by the queue"
              : "Check the Cloudflare Email Service dashboard — this error will not resolve on retry",
          internal: { wallet, tier, code, action },
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        }),
      );
      return action;
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
    } catch (cause) {
      log.error(
        createError({
          message: "Failed to record sent alert — email already delivered, acking to avoid re-send",
          why: "D1 insert or KV write failed after the email was accepted by CF Email Service",
          fix: "The next 12h cron run will re-evaluate and re-alert if the dedup window has elapsed",
          internal: { wallet, tier },
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        }),
      );
    }

    return "ack";
  } catch (cause) {
    // Anything unhandled (KV, D1, template render) is transient → retry, so a
    // single wallet's failure never throws out of the batch handler.
    log.error(cause instanceof Error ? cause : new Error(String(cause)));
    return "retry";
  }
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

/**
 * Only genuinely transient CF Email errors are worth retrying.
 * Quota exhaustion, misconfiguration, and suppressed recipients are permanent
 * for this send attempt — retrying will not help.
 */
function classifyEmailError(code: string): MessageAction {
  switch (code) {
    case "E_DELIVERY_FAILED":
    case "E_INTERNAL_SERVER_ERROR":
      return "retry";
    default:
      return "ack";
  }
}
