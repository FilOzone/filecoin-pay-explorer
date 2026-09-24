// Integration tests — no module mocking. All shared modules (auth, kv, db/queries)
// run real code against miniflare bindings. Only EMAIL and the rate limiters are
// overridden in testEnv because miniflare cannot simulate CF service bindings.
// SIWE messages are signed with a fixed test key (Anvil default — never deployed).

import { env } from "cloudflare:workers";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SIWE_STATEMENTS } from "../../api/auth";
import app from "../../api/index";
import { writePendingVerification } from "../../api/kv";
import {
  createVerifiedSubscription,
  findActiveMutes,
  findSubscriptionByWallet,
  findVerifiedEmailByEmail,
} from "../../api/queries";
import { createDb } from "../../shared/db/client";

const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const WALLET = account.address.toLowerCase();
const CHAIN_ID = 314159; // calibration

function makeSiwe(overrides: Partial<Parameters<typeof createSiweMessage>[0]> = {}) {
  const origin = env.FRONTEND_ORIGIN;
  const domain = new URL(origin).host;
  return createSiweMessage({
    address: account.address,
    chainId: CHAIN_ID,
    domain,
    nonce: "testonce1",
    uri: `${origin}/verify`,
    version: "1",
    issuedAt: new Date(Date.now() - 1000),
    ...overrides,
  });
}

const emailSend = vi.fn<(message: EmailMessage | EmailMessageBuilder) => Promise<void>>();
const rateLimiterLimit = vi.fn<(opts: { key: string }) => Promise<{ success: boolean }>>();
const muteRateLimiterLimit = vi.fn<(opts: { key: string }) => Promise<{ success: boolean }>>();

const testEnv = {
  ...env,
  EMAIL: { send: emailSend },
  RATE_LIMITER: { limit: rateLimiterLimit },
  MUTE_RATE_LIMITER: { limit: muteRateLimiterLimit },
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
  muteRateLimiterLimit.mockReset();
  muteRateLimiterLimit.mockResolvedValue({ success: true });
  await env.KV.delete(`verify:${WALLET}`);
  await env.DB.prepare("DELETE FROM wallet_subscriptions").run();
  await env.DB.prepare("DELETE FROM verified_emails").run();
  await env.DB.prepare("DELETE FROM muted_data_sets").run();
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
    const message = makeSiwe({
      issuedAt: new Date(Date.now() - 10 * 60 * 1000),
      statement: SIWE_STATEMENTS.subscribe("test@example.com"),
    });
    const signature = await account.signMessage({ message });
    const res = await post("/register", { message, signature, email: "test@example.com", preferredName: "Alice" });
    expect(res.status).toBe(401);
    expect(emailSend).not.toHaveBeenCalled();
    expect(await env.KV.get(`verify:${WALLET}`)).toBeNull();
  });

  it("normalises email to lowercase and trims preferredName end-to-end", async () => {
    // Statement uses the normalised email — both frontend and backend normalise before signing/verifying
    const message = makeSiwe({ statement: SIWE_STATEMENTS.subscribe("test@example.com") });
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
    const message = makeSiwe({ statement: SIWE_STATEMENTS.subscribe("test@example.com") });
    const signature = await account.signMessage({ message });
    const res = await post("/register", { message, signature, email: "test@example.com", preferredName: "Alice" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(emailSend).toHaveBeenCalledOnce();
    const emailMsg = emailSend.mock.calls.at(0)?.[0];
    expect(emailMsg?.from).toEqual({ name: "Filecoin Onchain Cloud", email: "noreply@filecoin.cloud" });
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

  it("returns 429 when rate limit is exceeded", async () => {
    rateLimiterLimit.mockResolvedValueOnce({ success: false });
    const res = await post("/unsubscribe", { message: "m", signature: "s" });
    expect(res.status).toBe(429);
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
    const message = makeSiwe({
      issuedAt: new Date(Date.now() - 10 * 60 * 1000),
      statement: SIWE_STATEMENTS.unsubscribe,
    });
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
    const message = makeSiwe({ statement: SIWE_STATEMENTS.unsubscribe });
    const signature = await account.signMessage({ message });
    const res = await post("/unsubscribe", { message, signature });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await findSubscriptionByWallet(db, WALLET)).toBeNull();
  });
});

// ─── POST /mute-dataset ──────────────────────────────────────────────────────

const inDays = (days: number) => Math.floor(Date.now() / 1000) + days * 86_400;

async function signedMute(dataSetId: string, mutedUntil: number) {
  const message = makeSiwe({ statement: SIWE_STATEMENTS.muteDataset(dataSetId, mutedUntil) });
  const signature = await account.signMessage({ message });
  return { message, signature, dataSetId, mutedUntil };
}

/** Inserts mutes for data sets "1".."count" of WALLET directly, bypassing the route. */
async function seedMutes(count: number, mutedUntil: number) {
  await env.DB.prepare(
    `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?1)
     INSERT INTO muted_data_sets (id, wallet_address, data_set_id, muted_until, created_at)
     SELECT 'seed-' || i, ?2, CAST(i AS TEXT), ?3, 0 FROM n`,
  )
    .bind(count, WALLET, mutedUntil)
    .run();
}

async function mutedRowCount() {
  const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM muted_data_sets").first<{ total: number }>();
  return row?.total;
}

describe("POST /mute-dataset", () => {
  it("returns 422 when required body fields are missing", async () => {
    const res = await post("/mute-dataset", { message: "m", signature: "s" });
    expect(res.status).toBe(422);
  });

  it("returns 422 when dataSetId is not a canonical decimal integer", async () => {
    for (const dataSetId of ["01", "abc", "1.5", "-1"]) {
      const res = await post("/mute-dataset", { message: "m", signature: "s", dataSetId, mutedUntil: inDays(30) });
      expect(res.status).toBe(422);
    }
  });

  it("returns 422 when mutedUntil is in the past or more than a year away", async () => {
    for (const mutedUntil of [inDays(-1), inDays(400)]) {
      const res = await post("/mute-dataset", { message: "m", signature: "s", dataSetId: "1", mutedUntil });
      expect(res.status).toBe(422);
    }
  });

  it("returns 429 when its own rate limit is exceeded", async () => {
    muteRateLimiterLimit.mockResolvedValueOnce({ success: false });
    const res = await post("/mute-dataset", { message: "m", signature: "s", dataSetId: "1", mutedUntil: inDays(30) });
    expect(res.status).toBe(429);
  });

  it("does not use the register and unsubscribe rate limit", async () => {
    await post("/mute-dataset", { message: "m", signature: "s", dataSetId: "1", mutedUntil: inDays(30) });
    expect(muteRateLimiterLimit).toHaveBeenCalledOnce();
    expect(rateLimiterLimit).not.toHaveBeenCalled();
  });

  it("returns 401 when SIWE verification fails and records no mute", async () => {
    const mutedUntil = inDays(30);
    const message = makeSiwe({
      issuedAt: new Date(Date.now() - 10 * 60 * 1000),
      statement: SIWE_STATEMENTS.muteDataset("1", mutedUntil),
    });
    const signature = await account.signMessage({ message });
    const res = await post("/mute-dataset", { message, signature, dataSetId: "1", mutedUntil });
    expect(res.status).toBe(401);
    expect(await mutedRowCount()).toBe(0);
  });

  it("returns 401 when the signed statement names a different dataset", async () => {
    const body = await signedMute("1", inDays(30));
    const res = await post("/mute-dataset", { ...body, dataSetId: "2" });
    expect(res.status).toBe(401);
  });

  it("returns 401 when the signed statement names a different end date", async () => {
    const body = await signedMute("1", inDays(30));
    const res = await post("/mute-dataset", { ...body, mutedUntil: inDays(90) });
    expect(res.status).toBe(401);
  });

  it("records the mute and its end date for the SIWE-recovered wallet", async () => {
    const mutedUntil = inDays(30);
    const res = await post("/mute-dataset", await signedMute("1", mutedUntil));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const db = createDb(env.DB);
    expect(await findActiveMutes(db, WALLET)).toEqual([{ dataSetId: "1", mutedUntil }]);
  });

  it("muting an already-muted dataset replaces its end date", async () => {
    await post("/mute-dataset", await signedMute("1", inDays(30)));
    const laterUntil = inDays(90);
    const res = await post("/mute-dataset", await signedMute("1", laterUntil));
    expect(res.status).toBe(200);
    const db = createDb(env.DB);
    expect(await findActiveMutes(db, WALLET)).toEqual([{ dataSetId: "1", mutedUntil: laterUntil }]);
  });

  it("returns 409 once the wallet has 10,000 active mutes, but still re-mutes one of them", async () => {
    await seedMutes(10_000, inDays(30));

    const newMute = await post("/mute-dataset", await signedMute("10001", inDays(30)));
    expect(newMute.status).toBe(409);

    const reMute = await post("/mute-dataset", await signedMute("1", inDays(90)));
    expect(reMute.status).toBe(200);
  });

  it("does not count expired mutes toward the limit", async () => {
    await seedMutes(10_000, inDays(-1));

    const res = await post("/mute-dataset", await signedMute("10001", inDays(30)));
    expect(res.status).toBe(200);
  });

  it("re-muting a dataset whose mute expired replaces its end date", async () => {
    await seedMutes(1, inDays(-1));
    const mutedUntil = inDays(30);

    const res = await post("/mute-dataset", await signedMute("1", mutedUntil));
    expect(res.status).toBe(200);
    expect(await mutedRowCount()).toBe(1);
    const db = createDb(env.DB);
    expect(await findActiveMutes(db, WALLET)).toEqual([{ dataSetId: "1", mutedUntil }]);
  });
});

// ─── GET /muted-datasets ─────────────────────────────────────────────────────

describe("GET /muted-datasets", () => {
  it("returns 422 when wallet param is missing", async () => {
    const res = await get("/muted-datasets");
    expect(res.status).toBe(422);
  });

  it("returns an empty list when the wallet has muted nothing", async () => {
    const res = await get(`/muted-datasets?wallet=${WALLET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mutes: [] });
  });

  it("returns only the requested wallet's active mutes", async () => {
    await seedMutes(1, inDays(-1)); // data set "1", expired
    const mutedUntil = inDays(30);
    await post("/mute-dataset", await signedMute("2", mutedUntil));

    const res = await get(`/muted-datasets?wallet=${WALLET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mutes: [{ dataSetId: "2", mutedUntil }] });

    const otherWalletRes = await get("/muted-datasets?wallet=0x9999999999999999999999999999999999999999");
    expect(await otherWalletRes.json()).toEqual({ mutes: [] });
  });
});
