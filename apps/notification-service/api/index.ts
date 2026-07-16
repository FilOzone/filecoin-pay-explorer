import { Hono } from "hono";

/**
 * notification-api — HTTP worker (Hono).
 * Handles registration, email verification, subscription status, and unsubscribe.
 *
 * `Bindings` types the Cloudflare bindings (DB, KV, vars) on `c.env`.
 * Routes are added directly after their path (Hono best practice — keeps path
 * params typed); the register/verify/status/unsubscribe routes land in the
 * API worker issue.
 */
const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));

export default app;
