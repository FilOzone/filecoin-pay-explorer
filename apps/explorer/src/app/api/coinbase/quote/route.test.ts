import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { generateJwt } = vi.hoisted(() => ({ generateJwt: vi.fn() }));
vi.mock("@coinbase/cdp-sdk/auth", () => ({ generateJwt }));

const address = "0x1111111111111111111111111111111111111111";
const account = { type: "wallet", wallet_client_type: "privy", chain_type: "ethereum", address };
const total = { address, paymentAmount: "5.00" };
const order = {
  paymentCurrency: "USD",
  paymentMethod: "GUEST_CHECKOUT_APPLE_PAY",
  purchaseCurrency: "USDC",
  destinationNetwork: "base",
  destinationAddress: address,
  purchaseAmount: "4.895196",
  paymentSubtotal: "4.90",
  paymentTotal: "5",
};
const keys = await generateKeyPair("ES256");
const publicKey = await exportSPKI(keys.publicKey);

function identity(claims: Record<string, unknown> = {}) {
  return new SignJWT({
    sub: "did:privy:quote-test",
    aud: "app-id",
    iss: "privy.io",
    exp: Math.floor(Date.now() / 1000) + 60,
    linked_accounts: JSON.stringify([account]),
    ...claims,
  })
    .setIssuedAt()
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .sign(keys.privateKey);
}

async function call(body: unknown = total, token: string | null = null, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest("http://localhost/api/coinbase/quote", {
      method: "POST",
      headers: { ...headers, ...(token && { authorization: `Bearer ${token}` }) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const fetchQuote = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_COINBASE_GUEST_SANDBOX", "true");
  vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "app-id");
  vi.stubEnv("PRIVY_VERIFICATION_KEY", publicKey);
  vi.stubEnv("CDP_API_KEY_ID", "test-id");
  vi.stubEnv("CDP_API_KEY_SECRET", "test-secret");
  vi.stubGlobal("fetch", fetchQuote);
  generateJwt.mockResolvedValue("scoped-token");
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("guest Apple Pay quote", () => {
  it.each([
    ["5.00", "4.90", "0.10", "4.895196"],
    ["12.34", "12.17", "0.17", "12.1698"],
    ["50.00", "49.00", "1.00", "49"],
  ])(
    "requests an inclusive $%s sandbox estimate only",
    async (paymentAmount, paymentSubtotal, feeTotal, purchaseAmount) => {
      fetchQuote.mockResolvedValue(
        Response.json({
          order: { ...order, paymentTotal: paymentAmount, paymentSubtotal, purchaseAmount },
          paymentLink: { url: "sensitive-payment-link" },
          userAuthToken: "sensitive-token",
        }),
      );
      const response = await call(
        { address, paymentAmount, isQuote: false, partnerUserRef: "live", email: "unused" },
        await identity(),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        paymentTotal: paymentAmount,
        feeTotal,
        purchaseAmount,
      });
      expect(generateJwt).toHaveBeenCalledWith({
        apiKeyId: "test-id",
        apiKeySecret: "test-secret",
        requestMethod: "POST",
        requestHost: "api.cdp.coinbase.com",
        requestPath: "/platform/v2/onramp/orders",
      });
      const [url, options] = fetchQuote.mock.calls[0];
      expect(String(url)).toBe("https://api.cdp.coinbase.com/platform/v2/onramp/orders");
      expect(options).toMatchObject({
        headers: { authorization: "Bearer scoped-token", "content-type": "application/json" },
        method: "POST",
        redirect: "error",
        cache: "no-store",
      });
      expect(JSON.parse(String(options?.body))).toEqual({
        isQuote: true,
        partnerUserRef: expect.stringMatching(/^sandbox-[\da-f]+$/),
        paymentAmount,
        destinationAddress: address,
        destinationNetwork: "base",
        paymentCurrency: "USD",
        purchaseCurrency: "USDC",
        paymentMethod: "GUEST_CHECKOUT_APPLE_PAY",
      });
    },
  );

  it.each(["4.99", "50.01", "5.001", "5e0", -5])("rejects invalid charge %s", async (paymentAmount) => {
    expect((await call({ ...total, paymentAmount })).status).toBe(400);
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON, oversize input, and invalid addresses", async () => {
    expect((await call("{")).status).toBe(400);
    expect((await call("x".repeat(1025))).status).toBe(413);
    expect((await call({ ...total, address: "1" })).status).toBe(400);
  });

  it.each([
    ["NEXT_PUBLIC_COINBASE_GUEST_SANDBOX", 404],
    ["CDP_API_KEY_SECRET", 503],
    ["PRIVY_VERIFICATION_KEY", 503],
  ] as const)("fails closed without %s", async (key, status) => {
    vi.stubEnv(key, "");
    const response = await call();
    expect(response.status).toBe(status);
    if (status === 503) expect(await response.json()).toMatchObject({ code: "sandbox_unconfigured" });
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it.each([
    { aud: "another-app" },
    { iss: "other-issuer" },
    { exp: 0 },
    { linked_accounts: JSON.stringify([{ ...account, address: "0x2222222222222222222222222222222222222222" }]) },
    { linked_accounts: JSON.stringify([{ ...account, wallet_client_type: "external" }]) },
    { linked_accounts: JSON.stringify([{ ...account, chain_type: "solana" }]) },
  ])("requires valid signed claims for this embedded EVM wallet", async (claims) => {
    expect((await call(total, await identity(claims))).status).toBe(401);
    expect(generateJwt).not.toHaveBeenCalled();
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("requires a signed identity", async () => {
    expect((await call()).status).toBe(401);
    expect((await call(total, "invalid-token")).status).toBe(401);
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("verifies a same-origin Privy identity cookie for the requested wallet", async () => {
    const headers = { cookie: `privy-id-token=${await identity()}`, origin: "http://localhost" };
    fetchQuote.mockResolvedValue(Response.json({ order }));
    expect((await call(total, null, headers)).status).toBe(200);
    expect(
      (await call({ ...total, address: "0x2222222222222222222222222222222222222222" }, null, headers)).status,
    ).toBe(401);
    expect((await call(total, null, { ...headers, origin: "https://example.com" })).status).toBe(401);
    expect((await call(total, null, { cookie: headers.cookie })).status).toBe(401);
    expect((await call(total, "invalid-token", headers)).status).toBe(401);
    expect(fetchQuote).toHaveBeenCalledTimes(1);
  });

  it.each([
    { destinationNetwork: "ethereum" },
    { destinationAddress: "other" },
    { paymentMethod: "DEBIT_CARD" },
    { purchaseCurrency: "ETH" },
    { paymentTotal: "5.01" },
    { paymentSubtotal: "5.01" },
    { paymentCurrency: "EUR" },
    { purchaseAmount: "0" },
    { purchaseAmount: "1.2345678" },
  ])("rejects a mismatched quote", async (variant) => {
    fetchQuote.mockResolvedValue(Response.json({ order: { ...order, ...variant } }));
    expect((await call(total, await identity())).status).toBe(502);
  });

  it("preserves an upstream rate limit and drops its response body", async () => {
    fetchQuote.mockResolvedValue(new Response("internal provider details", { status: 429 }));
    const response = await call(total, await identity());
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Coinbase could not quote this purchase." });
  });

  it("handles credential, provider authorization, network and timeout failures", async () => {
    const token = await identity();
    generateJwt.mockRejectedValueOnce(new Error("unprintable key"));
    expect((await call(total, token)).status).toBe(503);
    fetchQuote.mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect((await call(total, token)).status).toBe(503);
    fetchQuote.mockRejectedValueOnce(new Error("network"));
    expect((await call(total, token)).status).toBe(502);
    fetchQuote.mockRejectedValueOnce(new DOMException("slow", "TimeoutError"));
    expect((await call(total, token)).status).toBe(504);
  });
});
