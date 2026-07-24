// Integration tests — no module mocking. All shared modules (auth, kv, db/queries)
// run real code against miniflare bindings. Only EMAIL and RATE_LIMITER are
// overridden in testEnv because miniflare cannot simulate CF service bindings.
// SIWE messages are signed with a fixed test key (Anvil default — never deployed).

import { env } from "cloudflare:workers";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../api/index";
import { writePendingVerification } from "../../api/kv";
import { createVerifiedSubscription, findSubscriptionByWallet, findVerifiedEmailByEmail } from "../../api/queries";
import { createDb } from "../../shared/db/client";

const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const WALLET = account.address.toLowerCase();
const DOMAIN = "pay.filecoin.cloud"; // must match FRONTEND_ORIGIN in wrangler staging vars
const CHAIN_ID = 314159; // calibration

function makeSiwe(overrides: Partial<Parameters<typeof createSiweMessage>[0]> = {}) {
  return createSiweMessage({
    address: account.address,
    chainId: CHAIN_ID,
    domain: DOMAIN,
    nonce: "testonce1",
    uri: `https://${DOMAIN}/verify`,
    version: "1",
    issuedAt: new Date(Date.now() - 1000),
    ...overrides,
  });
}

const emailSend = vi.fn<(message: EmailMessage) => Promise<void>>();
const rateLimiterLimit = vi.fn<(opts: { key: string }) => Promise<{ success: boolean }>>();

const testEnv = {
  ...env,
  EMAIL: { send: emailSend },
  RATE_LIMITER: { limit: rateLimiterLimit },
} as unknown as typeof env;

function post(path: string, body: unknown) {
  return app.request(
    path,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    testEnv as unknown as Parameters<typeof app.request>[2],
  );
}

function get(path: string) {
  return app.request(path, {}, testEnv as unknown as Parameters<typeof app.request>[2]);
}

beforeEach(async () => {
  emailSend.mockReset();
  emailSend.mockResolvedValue(undefined);
  rateLimiterLimit.mockReset();
  rateLimiterLimit.mockResolvedValue({ success: true });
  await env.KV.delete(`verify:${WALLET}`);
  await env.DB.prepare("DELETE FROM wallet_subscriptions").run();
  await env.DB.prepare("DELETE FROM verified_emails").run();
});

// ─── GET /health ─────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 ok", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});

// ─── POST /register ──────────────────────────────────────────────────────────

describe("POST /register", () => {
  it("returns 422 when required body fields are missing", async () => {
    const res = await post("/register", {});
    expect(res.status).toBe(422);
  });

  it("returns 422 when preferredName is blank after trim", async () => {
    const res = await post("/register", {
      message: "m",
      signature: "s",
      email: "test@example.com",
      preferredName: "   ",
    });
    expect(res.status).toBe(422);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    rateLimiterLimit.mockResolvedValueOnce({ success: false });
    const res = await post("/register", {
      message: "m",
      signature: "s",
      email: "test@example.com",
      preferredName: "Alice",
    });
    expect(res.status).toBe(429);
    expect(emailSend).not.toHaveBeenCalled();
    expect(await env.KV.get(`verify:${WALLET}`)).toBeNull();
  });

  it("returns 400 when email syntax is invalid", async () => {
    const res = await post("/register", {
      message: "m",
      signature: "s",
      email: "not-an-email",
      preferredName: "Alice",
    });
    expect(res.status).toBe(400);
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("returns 401 when SIWE verification fails", async () => {
    const message = makeSiwe({ issuedAt: new Date(Date.now() - 10 * 60 * 1000) });
    const signature = await account.signMessage({ message });
    const res = await post("/register", { message, signature, email: "test@example.com", preferredName: "Alice" });
    expect(res.status).toBe(401);
    expect(emailSend).not.toHaveBeenCalled();
    expect(await env.KV.get(`verify:${WALLET}`)).toBeNull();
  });

  it("normalises email to lowercase and trims preferredName end-to-end", async () => {
    const message = makeSiwe();
    const signature = await account.signMessage({ message });
    const res = await post("/register", { message, signature, email: "Test@Example.COM", preferredName: "  Alice  " });
    expect(res.status).toBe(200);
    // Normalization is visible at the email dispatch boundary before any KV assertion
    expect(emailSend.mock.calls.at(0)?.[0].to).toBe("test@example.com");
    // Use KV only to extract the token so we can drive /verify — not to assert the stored shape
    const { token } = JSON.parse((await env.KV.get(`verify:${WALLET}`)) ?? "{}");
    await get(`/verify?wallet=${WALLET}&token=${token}`);
    // Canonical form is confirmed when D1 stores the correct values
    const db = createDb(env.DB);
    expect(await findVerifiedEmailByEmail(db, "test@example.com")).toMatchObject({
      email: "test@example.com",
      preferredName: "Alice",
    });
  });

  it("sends a verification email to the correct recipient", async () => {
    const message = makeSiwe();
    const signature = await account.signMessage({ message });
    const res = await post("/register", { message, signature, email: "test@example.com", preferredName: "Alice" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(emailSend).toHaveBeenCalledOnce();
    // EmailMessage only exposes from/to in the constructor-created form; raw is not readable back
    const emailMsg = emailSend.mock.calls.at(0)?.[0];
    expect(emailMsg?.from).toBe("noreply@filecoin.cloud");
    expect(emailMsg?.to).toBe("test@example.com");
  });
});

// ─── GET /verify ─────────────────────────────────────────────────────────────

describe("GET /verify", () => {
  it("returns 422 when wallet or token query params are missing", async () => {
    const res = await get("/verify");
    expect(res.status).toBe(422);
  });

  it("returns 404 when token does not exist in KV", async () => {
    const res = await get(`/verify?wallet=${WALLET}&token=badtoken`);
    expect(res.status).toBe(404);
  });

  it("creates subscription and token cannot be replayed", async () => {
    const TOKEN = "test-token-abc";
    await writePendingVerification(env.KV, WALLET, { token: TOKEN, email: "test@example.com", preferredName: "Alice" });
    const res = await get(`/verify?wallet=${WALLET}&token=${TOKEN}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const db = createDb(env.DB);
    expect(await findSubscriptionByWallet(db, WALLET)).toMatchObject({ walletAddress: WALLET });
    // Token is consumed — replaying the same request must not succeed
    const replayRes = await get(`/verify?wallet=${WALLET}&token=${TOKEN}`);
    expect(replayRes.status).toBe(404);
  });

  it("normalises wallet to lowercase before reading from KV", async () => {
    const TOKEN = "test-token-xyz";
    await writePendingVerification(env.KV, WALLET, { token: TOKEN, email: "test@example.com", preferredName: "Alice" });
    const res = await get(`/verify?wallet=${WALLET.toUpperCase()}&token=${TOKEN}`);
    expect(res.status).toBe(200);
    const db = createDb(env.DB);
    expect(await findSubscriptionByWallet(db, WALLET)).toMatchObject({ walletAddress: WALLET });
  });
});

// ─── GET /status ─────────────────────────────────────────────────────────────

describe("GET /status", () => {
  it("returns 422 when wallet param is missing", async () => {
    const res = await get("/status");
    expect(res.status).toBe(422);
  });

  it("returns subscribed: false when wallet has no subscription", async () => {
    const res = await get(`/status?wallet=${WALLET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subscribed: false });
  });

  it("returns subscribed: true when wallet has an active subscription", async () => {
    const db = createDb(env.DB);
    await createVerifiedSubscription(db, {
      emailId: "email-1",
      email: "test@example.com",
      preferredName: "Alice",
      subscriptionId: "sub-1",
      walletAddress: WALLET,
    });
    const res = await get(`/status?wallet=${WALLET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subscribed: true });
  });
});

// ─── POST /unsubscribe ───────────────────────────────────────────────────────

describe("POST /unsubscribe", () => {
  it("returns 422 when required body fields are missing", async () => {
    const res = await post("/unsubscribe", {});
    expect(res.status).toBe(422);
  });

  it("returns 401 when SIWE verification fails and leaves any existing subscription intact", async () => {
    const db = createDb(env.DB);
    await createVerifiedSubscription(db, {
      emailId: "email-1",
      email: "test@example.com",
      preferredName: "Alice",
      subscriptionId: "sub-1",
      walletAddress: WALLET,
    });
    const message = makeSiwe({ issuedAt: new Date(Date.now() - 10 * 60 * 1000) });
    const signature = await account.signMessage({ message });
    const res = await post("/unsubscribe", { message, signature });
    expect(res.status).toBe(401);
    expect(await findSubscriptionByWallet(db, WALLET)).not.toBeNull();
  });

  it("deletes the subscription for the SIWE-recovered wallet address on success", async () => {
    const db = createDb(env.DB);
    await createVerifiedSubscription(db, {
      emailId: "email-1",
      email: "test@example.com",
      preferredName: "Alice",
      subscriptionId: "sub-1",
      walletAddress: WALLET,
    });
    const message = makeSiwe();
    const signature = await account.signMessage({ message });
    const res = await post("/unsubscribe", { message, signature });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await findSubscriptionByWallet(db, WALLET)).toBeNull();
  });
});
