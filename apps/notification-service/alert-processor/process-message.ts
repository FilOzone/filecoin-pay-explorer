import { createError, type createLogger } from "evlog";
import { warmStorageAddress } from "../shared/chain";
import type { DB } from "../shared/db/client";
import { FROM_EMAIL, FROM_NAME } from "../shared/emails/config";
import { type AlertEmailProps, renderAlertEmail } from "../shared/emails/templates/AlertEmail";
import { renderInactivityEmail } from "../shared/emails/templates/InactivityEmail";
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
import { fetchStaleDataSets, formatMonthlySpend, type StaleDataSets, selectDataSetsToEmail } from "./inactivity";
import { findDataSetMutes, findInactivityAlerts, findSubscriberEmail, recordInactivityAlerts } from "./queries";

/** The inactivity email lists this many datasets and counts the rest. */
const MAX_LISTED_DATA_SETS = 10;

/** What the queue handler should do with the message. */
export type MessageAction = "ack" | "retry";

export interface ProcessorFields {
  outcome: string;
  action: string;
  health: { tier: string; runwayDays: number };
  alert: { tier: string; daysRemaining: number; fundedUntilSec: number };
  inactivity: { outcome: string; dataSets: number };
}

/** A rendered alert ready for the email binding. */
export type OutboundEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * The external boundaries, injected so tests can mock RPC, the subgraph and
 * email while D1 and KV run for real.
 */
export type ProcessDeps = {
  readSummary: (client: ReadClient, wallet: string) => Promise<AccountSummary>;
  fetchStaleDataSets: (subgraphUrl: string, wallet: string, nowSec: number) => Promise<StaleDataSets>;
  sendEmail: (env: Env, message: OutboundEmail) => Promise<void>;
};

export const defaultDeps: ProcessDeps = {
  readSummary: readAccountSummary,
  fetchStaleDataSets,
  sendEmail: sendAlertEmail,
};

type ProcessorLog = ReturnType<typeof createLogger<ProcessorFields>>;

/**
 * Processes one already-validated alert message and returns whether to ack or
 * retry. Runs the balance and inactivity checks independently. A retry re-runs
 * both, and each skips an email it already recorded.
 */
export async function processMessage(
  env: Env,
  client: ReadClient,
  db: DB,
  body: AlertMessage,
  log: ProcessorLog,
  deps: ProcessDeps = defaultDeps,
): Promise<MessageAction> {
  const wallet = body.walletAddress.toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);

  const balance = await processBalanceAlert(env, client, db, wallet, nowSec, log, deps);
  const inactivity = await processInactivityAlert(env, db, wallet, nowSec, log, deps);
  return balance === "retry" || inactivity === "retry" ? "retry" : "ack";
}

/**
 * Sends a low-balance alert when the account's runway is short. Does not throw —
 * every failure maps to an action: transient errors (RPC read, email send, or
 * anything unexpected) return "retry"; a failure to record after the email is
 * sent still acks, to avoid re-sending.
 */
async function processBalanceAlert(
  env: Env,
  client: ReadClient,
  db: DB,
  wallet: string,
  nowSec: number,
  log: ProcessorLog,
  deps: ProcessDeps,
): Promise<MessageAction> {
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

/**
 * Emails the wallet once about datasets that newly passed the inactivity
 * threshold. Same contract as the balance alert: never throws, retries
 * transient failures, and acks once the email is out even if recording fails.
 */
async function processInactivityAlert(
  env: Env,
  db: DB,
  wallet: string,
  nowSec: number,
  log: ProcessorLog,
  deps: ProcessDeps,
): Promise<MessageAction> {
  try {
    const subscriber = await findSubscriberEmail(db, wallet);
    if (!subscriber) {
      log.set({ inactivity: { outcome: "no_subscriber", dataSets: 0 } });
      return "ack";
    }

    let stale: StaleDataSets;
    try {
      stale = await deps.fetchStaleDataSets(env.SUBGRAPH_URL, wallet, nowSec);
    } catch (cause) {
      log.error(
        createError({
          message: "Failed to read stale datasets from the subgraph",
          why: cause instanceof Error ? cause.message : String(cause),
          fix: "Check the SUBGRAPH_URL var and the subgraph's health; the message will be retried",
          internal: { wallet },
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        }),
      );
      return "retry";
    }

    const [mutes, sent] = await Promise.all([findDataSetMutes(db, wallet), findInactivityAlerts(db, wallet)]);
    const dataSets = selectDataSetsToEmail(stale, mutes, sent, nowSec);
    if (dataSets.length === 0) {
      log.set({ inactivity: { outcome: "nothing_new", dataSets: 0 } });
      return "ack";
    }

    const serviceUrl = `${env.FRONTEND_ORIGIN}/console/services/${warmStorageAddress(env.NETWORK)}`;
    const listed = dataSets.slice(0, MAX_LISTED_DATA_SETS);
    const { subject, html, text } = await renderInactivityEmail({
      name: subscriber.name,
      walletAddress: wallet,
      dataSets: listed.map((dataSet) => ({
        dataSetId: dataSet.dataSetId,
        daysInactive: dataSet.daysInactive,
        monthlySpend: formatMonthlySpend(dataSet),
        url: `${serviceUrl}?dataset=${dataSet.dataSetId}#stale`,
      })),
      moreCount: dataSets.length - listed.length,
      queueUrl: `${serviceUrl}#stale`,
    });

    try {
      await deps.sendEmail(env, { to: subscriber.email, subject, html, text });
    } catch (cause) {
      const code: string = (cause as { code?: string }).code ?? "UNKNOWN";
      const action = classifyEmailError(code);
      log.error(
        createError({
          message: "Failed to send inactivity email",
          why: cause instanceof Error ? cause.message : String(cause),
          fix:
            action === "retry"
              ? "The message will be retried automatically by the queue"
              : "Check the Cloudflare Email Service dashboard — this error will not resolve on retry",
          internal: { wallet, dataSets: dataSets.length, code, action },
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        }),
      );
      return action;
    }

    log.set({ inactivity: { outcome: "sent", dataSets: dataSets.length } });

    // Email is out; a failed record can't un-send it, so ack rather than retry.
    try {
      await recordInactivityAlerts(db, { wallet, emailSentTo: subscriber.email, sentAt: nowSec, dataSets });
    } catch (cause) {
      log.error(
        createError({
          message: "Failed to record sent inactivity email — email already delivered, acking to avoid re-send",
          why: "D1 upsert into inactivity_alerts failed after the email was accepted by CF Email Service",
          fix: "The next 12h cron run will email these datasets again",
          internal: { wallet, dataSets: dataSets.length },
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        }),
      );
    }

    return "ack";
  } catch (cause) {
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
