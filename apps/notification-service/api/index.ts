import { zValidator } from "@hono/zod-validator";
import { parseError } from "evlog";
import { type EvlogVariables, evlog } from "evlog/hono";
import { initWorkersLogger } from "evlog/workers";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { Network } from "../shared/chain";
import { getChain } from "../shared/chain";
import { createDb } from "../shared/db/client";
import { FROM_EMAIL, FROM_NAME } from "../shared/emails/config";
import { renderVerificationEmail } from "../shared/emails/templates/VerificationEmail";
import { SIWE_STATEMENTS, verifySiwe } from "./auth";
import { validateEmail } from "./email-validation";
import { deletePendingVerification, readPendingVerification, writePendingVerification } from "./kv";
import { createVerifiedSubscription, deleteSubscription, findSubscriptionByWallet } from "./queries";

initWorkersLogger({ env: { service: "notification-api" } });

// --- Schemas ---

const registerBody = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
  email: z
    .string()
    .min(1)
    .transform((s) => s.toLowerCase()),
  preferredName: z.string().trim().min(1, "Preferred name is required").max(100),
});

const siweBody = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
});

const verifyQuery = z.object({
  wallet: z
    .string()
    .min(1)
    .transform((s) => s.toLowerCase()),
  token: z.string().min(1),
});

const statusQuery = z.object({
  wallet: z
    .string()
    .min(1)
    .transform((s) => s.toLowerCase()),
});

// --- Types ---

type AppEnv = { Bindings: Env } & EvlogVariables;

// --- Helpers ---

async function verifyRequestSiwe(
  c: Context<AppEnv>,
  body: { message: string; signature: string },
  expectedStatement: string,
) {
  const domain = new URL(c.env.FRONTEND_ORIGIN).host;
  const chainId = getChain(c.env.NETWORK as Network).id;
  return verifySiwe({ message: body.message, signature: body.signature, domain, chainId, expectedStatement });
}

// --- App ---

const app = new Hono<AppEnv>();

app.use("*", evlog());

app.use("*", (c, next) =>
  cors({
    origin: c.env.FRONTEND_ORIGIN,
    allowMethods: ["GET", "POST"],
    allowHeaders: ["Content-Type"],
  })(c, next),
);

app.onError((err, c) => {
  const log = c.get("log");
  log.error(err);
  const parsed = parseError(err);
  return c.json(
    { message: parsed.message, why: parsed.why, fix: parsed.fix, link: parsed.link },
    parsed.status as ContentfulStatusCode,
  );
});

app.get("/health", (c) => c.text("ok"));

// POST /register
// Rate-limited per IP. Verifies SIWE, validates email, writes a pending KV token,
// and sends a verification email.
app.post(
  "/register",
  zValidator("json", registerBody, (result, c) => {
    if (!result.success) return c.json({ error: result.error.message ?? "Invalid request body" }, 422);
  }),
  async (c) => {
    const log = c.get("log");
    log.set({ route: "register" });

    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      log.set({ outcome: "rate_limited" });
      return c.json({ error: "Too many requests" }, 429);
    }

    const { message, signature, email, preferredName } = c.req.valid("json");
    log.set({ email });

    const emailResult = validateEmail(email);
    if (!emailResult.ok) {
      log.set({ outcome: "invalid_email" });
      return c.json({ error: emailResult.error }, 400);
    }

    const siweResult = await verifyRequestSiwe(c, { message, signature }, SIWE_STATEMENTS.subscribe(email));
    if (!siweResult.ok) {
      log.set({ outcome: "auth_failed", reason: siweResult.error });
      return c.json({ error: siweResult.error }, 401);
    }

    const walletAddress = siweResult.walletAddress.toLowerCase();
    log.set({ wallet: walletAddress });

    const token = crypto.randomUUID();

    await writePendingVerification(c.env.KV, walletAddress, { token, email, preferredName });

    const verificationUrl = `${c.env.FRONTEND_ORIGIN}/console/notifications/verify?wallet=${walletAddress}&token=${token}`;

    const { html, text } = await renderVerificationEmail({
      name: preferredName,
      walletAddress,
      verificationUrl,
    });

    await c.env.EMAIL.send({
      from: { name: FROM_NAME, email: FROM_EMAIL },
      to: email,
      subject: "Confirm your email address",
      html,
      text,
    });

    log.set({ outcome: "success" });
    return c.json({ ok: true });
  },
);

// GET /verify?token=
// Consumes the KV token and persists the subscription to D1.
// Token is deleted after the D1 writes succeed — replay is harmless (upserts are idempotent).
app.get(
  "/verify",
  zValidator("query", verifyQuery, (result, c) => {
    if (!result.success) return c.json({ error: result.error.message ?? "Invalid request body" }, 422);
  }),
  async (c) => {
    const log = c.get("log");
    const { wallet, token } = c.req.valid("query");
    log.set({ route: "verify", wallet });

    const pending = await readPendingVerification(c.env.KV, wallet, token);
    if (!pending) {
      log.set({ outcome: "token_invalid" });
      return c.json({ error: "Invalid or expired token" }, 404);
    }

    const db = createDb(c.env.DB);
    await createVerifiedSubscription(db, {
      emailId: crypto.randomUUID(),
      email: pending.email,
      preferredName: pending.preferredName,
      subscriptionId: crypto.randomUUID(),
      walletAddress: wallet,
    });

    await deletePendingVerification(c.env.KV, wallet);

    log.set({ outcome: "success" });
    return c.json({ ok: true });
  },
);

// GET /status?wallet=
// Returns { subscribed: boolean }. No email address exposed.
app.get(
  "/status",
  zValidator("query", statusQuery, (result, c) => {
    if (!result.success) return c.json({ error: result.error.message ?? "Invalid request body" }, 422);
  }),
  async (c) => {
    const log = c.get("log");
    const { wallet } = c.req.valid("query");
    const db = createDb(c.env.DB);
    const sub = await findSubscriptionByWallet(db, wallet);
    const subscribed = sub !== null;
    log.set({ route: "status", wallet, subscribed });
    return c.json({ subscribed });
  },
);

// POST /unsubscribe
// Verifies SIWE and hard-deletes the subscription row, cleaning up orphaned
// verified_email rows in the same transaction.
app.post(
  "/unsubscribe",
  zValidator("json", siweBody, (result, c) => {
    if (!result.success) return c.json({ error: result.error.message ?? "Invalid request body" }, 422);
  }),
  async (c) => {
    const log = c.get("log");
    log.set({ route: "unsubscribe" });

    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      log.set({ outcome: "rate_limited" });
      return c.json({ error: "Too many requests" }, 429);
    }

    const { message, signature } = c.req.valid("json");

    const siweResult = await verifyRequestSiwe(c, { message, signature }, SIWE_STATEMENTS.unsubscribe);
    if (!siweResult.ok) {
      log.set({ outcome: "auth_failed", reason: siweResult.error });
      return c.json({ error: siweResult.error }, 401);
    }

    const walletAddress = siweResult.walletAddress.toLowerCase();
    log.set({ wallet: walletAddress });

    const db = createDb(c.env.DB);
    await deleteSubscription(db, walletAddress);

    log.set({ outcome: "success" });
    return c.json({ ok: true });
  },
);

export default app;
