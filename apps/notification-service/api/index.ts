import { EmailMessage } from "cloudflare:email";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { verifySiwe } from "../shared/auth";
import type { Network } from "../shared/chain";
import { getChain } from "../shared/chain";
import {
  createDb,
  createVerifiedSubscription,
  deleteSubscription,
  findSubscriptionByWallet,
} from "../shared/db/queries";
import { validateEmail } from "../shared/email-validation";
import { renderVerificationEmail } from "../shared/emails/templates/VerificationEmail";
import { deletePendingVerification, readPendingVerification, writePendingVerification } from "../shared/kv";

const FROM_EMAIL = "noreply@filecoin.cloud";
const FROM_NAME = "Filecoin Onchain Cloud";

// --- Schemas ---

const registerBody = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
  email: z
    .string()
    .min(1)
    .transform((s) => s.toLowerCase()),
  preferredName: z.string().trim().min(1, "Preferred name is required"),
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

// --- Helpers ---

async function verifyRequestSiwe(c: Context<{ Bindings: Env }>, body: { message: string; signature: string }) {
  const domain = new URL(c.env.FRONTEND_ORIGIN).host;
  const chainId = getChain(c.env.NETWORK as Network).id;
  return verifySiwe({ message: body.message, signature: body.signature, domain, chainId });
}

// --- App ---

const app = new Hono<{ Bindings: Env }>();

app.use("*", (c, next) =>
  cors({
    origin: c.env.FRONTEND_ORIGIN,
    allowMethods: ["GET", "POST"],
    allowHeaders: ["Content-Type"],
  })(c, next),
);

app.onError((err, c) => {
  console.error(
    JSON.stringify({
      route: c.req.path,
      method: c.req.method,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  return c.json({ error: "Internal server error" }, 500);
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
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return c.json({ error: "Too many requests" }, 429);
    }

    const { message, signature, email, preferredName } = c.req.valid("json");

    const emailResult = validateEmail(email);
    if (!emailResult.ok) {
      return c.json({ error: emailResult.error }, 400);
    }

    const siweResult = await verifyRequestSiwe(c, { message, signature });
    if (!siweResult.ok) {
      return c.json({ error: siweResult.error }, 401);
    }

    const walletAddress = siweResult.walletAddress.toLowerCase();
    const token = crypto.randomUUID();

    await writePendingVerification(c.env.KV, walletAddress, { token, email, preferredName });

    const verificationUrl = `${c.env.FRONTEND_ORIGIN}/console/notifications/verify?wallet=${walletAddress}&token=${token}`;

    const { html, text } = await renderVerificationEmail({
      name: preferredName,
      walletAddress,
      verificationUrl,
    });

    await c.env.EMAIL.send(
      new EmailMessage(
        FROM_EMAIL,
        email,
        buildMimeEmail({
          from: FROM_EMAIL,
          fromName: FROM_NAME,
          to: email,
          subject: "Confirm your email address",
          html,
          text,
        }),
      ),
    );

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
    const { wallet, token } = c.req.valid("query");

    const pending = await readPendingVerification(c.env.KV, wallet, token);
    if (!pending) {
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
    const { wallet } = c.req.valid("query");
    const db = createDb(c.env.DB);
    const sub = await findSubscriptionByWallet(db, wallet);
    return c.json({ subscribed: sub !== null });
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
    const { message, signature } = c.req.valid("json");

    const siweResult = await verifyRequestSiwe(c, { message, signature });
    if (!siweResult.ok) {
      return c.json({ error: siweResult.error }, 401);
    }

    const db = createDb(c.env.DB);
    await deleteSubscription(db, siweResult.walletAddress.toLowerCase());

    return c.json({ ok: true });
  },
);

function buildMimeEmail({
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

export default app;
