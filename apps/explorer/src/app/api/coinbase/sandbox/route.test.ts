import { createHash, randomUUID } from "node:crypto";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { sign } = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock("@coinbase/cdp-sdk/auth", () => ({ generateJwt: sign }));
const upstream = vi.fn<typeof fetch>();
const address = "0x1111111111111111111111111111111111111111";
const origin = "http://localhost:3030";
const api = `${origin}/api/coinbase/sandbox`;
const headers = { host: "localhost:3030", origin, "content-type": "application/json" };
const quoteRequest = { action: "quote", address, acceptedTerms: true };
const orderRequest = () => ({ ...quoteRequest, action: "order", attemptId: randomUUID() });
const partnerUserRef = `sandbox-${createHash("sha256").update(address).digest("hex").slice(0, 32)}`;
const quote = { feeTotal: "0.10", paymentTotal: "5.00", purchaseAmount: "4.8999" };
const order = {
  destinationAddress: address,
  destinationNetwork: "base",
  orderId: "123e4567-e89b-12d3-a456-426614174000",
  partnerUserRef,
  paymentCurrency: "USD",
  paymentMethod: "GUEST_CHECKOUT_APPLE_PAY",
  paymentSubtotal: "4.90",
  paymentTotal: "5",
  purchaseAmount: "4.8999",
  purchaseCurrency: "USDC",
};
const applePay = "https://pay.coinbase.com/v2/api-onramp/apple-pay";
const paymentLink = {
  paymentLinkType: "PAYMENT_LINK_TYPE_APPLE_PAY_BUTTON",
  url: `${applePay}?sessionToken=test-session`,
};

function call(body: unknown = quoteRequest, headerOverrides: Record<string, string> = {}, url = api) {
  const request = new NextRequest(url, {
    method: "POST",
    headers: { ...headers, ...headerOverrides },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(request);
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("CDP_API_KEY_ID", "test-key");
  vi.stubEnv("CDP_API_KEY_SECRET", "test-secret");
  vi.stubGlobal("fetch", upstream);
  sign.mockResolvedValue("scoped-test-jwt");
  upstream.mockImplementation(async () => Response.json({ order, paymentLink, userAuthToken: "private-token" }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("local Coinbase sandbox", () => {
  it.each(["production", "test"])("stays off in %s, including on loopback", async (mode) => {
    vi.stubEnv("NODE_ENV", mode);
    expect((await call()).status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("stays off on a hosted Vercel development deployment", async () => {
    vi.stubEnv("VERCEL", "1");
    expect((await call()).status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
  });

  it.each([
    [api, { "x-forwarded-proto": "https" }, 404],
    [api.replace("localhost", "preview.example"), {}, 404],
    [api.replace("localhost", "127.0.0.1"), { host: "127.0.0.1:3030" }, 404],
    [api.replace("http:", "https:"), {}, 404],
    [api, { origin: "http://localhost:3031" }, 403],
    [api, { host: "preview.example" }, 404],
    [api, { origin: "" }, 403],
    [api, { origin: "https://other.example", "x-forwarded-host": "localhost:3030" }, 403],
    [api, { "content-type": "text/plain" }, 415],
  ] as const)("checks request URL, browser origin, host and media type", async (url, overrides, status) => {
    const response = await call(quoteRequest, overrides, url);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(sign).not.toHaveBeenCalled();
  });

  it.each([
    { ...quoteRequest, acceptedTerms: false },
    { ...orderRequest(), acceptedTerms: undefined },
    { ...quoteRequest, action: "pay" },
    { ...quoteRequest, address: "0x0000000000000000000000000000000000000000" },
    { ...orderRequest(), attemptId: "not-a-uuid" },
    { ...quoteRequest, paymentAmount: "50" },
    { ...quoteRequest, email: "mine@example.com" },
    { ...orderRequest(), domain: "other.example" },
    { ...orderRequest(), partnerUserRef: "production" },
    "{",
  ])("rejects malformed or caller-controlled payment settings", async (body) => {
    expect((await call(body)).status).toBe(400);
    expect(sign).not.toHaveBeenCalled();
  });

  it("bounds declared and actual UTF-8 bytes even without content-length", async () => {
    expect((await call(quoteRequest, { "content-length": "1025" })).status).toBe(413);
    expect((await call("é".repeat(513))).status).toBe(413);
    expect(sign).not.toHaveBeenCalled();
  });

  it.each(["quote", "order"])(
    "uses standard simulated contacts and only returns approved %s fields",
    async (action) => {
      const request = action === "quote" ? quoteRequest : orderRequest();
      const response = await call(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual(
        action === "quote"
          ? { quote }
          : {
              quote,
              orderId: order.orderId,
              paymentUrl: `${applePay}?sessionToken=test-session&useApplePaySandbox=true`,
            },
      );
      const [url, init] = upstream.mock.calls[0];
      expect(String(url)).toBe("https://api.cdp.coinbase.com/platform/v2/onramp/orders");
      expect(init).toMatchObject({
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: expect.any(AbortSignal),
        headers: { authorization: "Bearer scoped-test-jwt", "content-type": "application/json" },
      });
      const providerBody = JSON.parse(String(init?.body));
      expect(providerBody).toEqual({
        agreementAcceptedAt: expect.any(String),
        clientIp: "192.0.2.1",
        destinationAddress: address,
        destinationNetwork: "base",
        domain: "localhost",
        email: "tester@sandbox.test",
        isQuote: action === "quote",
        partnerUserRef,
        paymentAmount: "5.00",
        paymentCurrency: "USD",
        paymentMethod: "GUEST_CHECKOUT_APPLE_PAY",
        phoneNumber: "+12025550142",
        phoneNumberVerifiedAt: providerBody.agreementAcceptedAt,
        purchaseCurrency: "USDC",
        ...("attemptId" in request && { partnerOrderRef: request.attemptId }),
      });
      expect(Date.parse(providerBody.agreementAcceptedAt)).toBeGreaterThan(Date.now() - 60_000);
      expect(sign).toHaveBeenCalledWith({
        apiKeyId: "test-key",
        apiKeySecret: "test-secret",
        requestHost: "api.cdp.coinbase.com",
        requestMethod: "POST",
        requestPath: "/platform/v2/onramp/orders",
      });
    },
  );

  it.each([
    { order: { ...order, paymentTotal: "6.00" } },
    { order: { ...order, destinationAddress: "other" } },
    { order: { ...order, destinationNetwork: "ethereum" } },
    { order: { ...order, purchaseCurrency: "ETH" } },
    { order: { ...order, partnerUserRef: "live-user" }, paymentLink },
    { order: { ...order, orderId: "" }, paymentLink },
    { order, paymentLink: { ...paymentLink, paymentLinkType: "PAYMENT_LINK_TYPE_EMBEDDED_ORDER" } },
  ])("rejects mismatched provider orders", async (result) => {
    upstream.mockResolvedValue(Response.json(result));
    expect((await call(orderRequest())).status).toBe(502);
  });

  it.each([
    "https://pay.coinbase.com.example/v2/api-onramp/apple-pay?sessionToken=s",
    "https://user@pay.coinbase.com/v2/api-onramp/apple-pay?sessionToken=s",
    "https://pay.coinbase.com/redirect?sessionToken=s",
    `${applePay}?sessionToken=s#redirect`,
    `${applePay}?sessionToken=x&sessionToken=y`,
    applePay,
    applePay.replace("https:", "http:"),
    "invalid",
  ])("discards unexpected payment URLs", async (url) => {
    upstream.mockResolvedValue(Response.json({ order, paymentLink: { ...paymentLink, url } }));
    expect((await call(orderRequest())).status).toBe(502);
  });

  it("preserves trusted widget parameters, drops redirects and forces one sandbox flag", async () => {
    upstream.mockResolvedValue(
      Response.json({
        order,
        paymentLink: {
          ...paymentLink,
          url: `${paymentLink.url}&locale=en-US&redirect_url=https://other.example&useApplePaySandbox=false&useApplePaySandbox=false`,
        },
      }),
    );
    const response = await call(orderRequest());
    expect((await response.json()).paymentUrl).toBe(`${paymentLink.url}&locale=en-US&useApplePaySandbox=true`);
  });

  it("blocks concurrent and repeated orders when Coinbase's response is lost", async () => {
    const request = orderRequest();
    const pending = Promise.withResolvers<Response>();
    upstream.mockReturnValueOnce(pending.promise);
    const first = call(request);
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(1));
    expect((await call(request)).status).toBe(409);
    pending.reject(new DOMException("Provider timeout", "TimeoutError"));
    expect((await first).status).toBe(504);
    expect((await call(request)).status).toBe(409);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("reports missing credentials, authorization, signing and network failures without provider payloads", async () => {
    vi.stubEnv("CDP_API_KEY_SECRET", "");
    expect((await call()).status).toBe(503);
    expect(sign).not.toHaveBeenCalled();
    vi.stubEnv("CDP_API_KEY_SECRET", "test-secret");
    sign.mockRejectedValueOnce(new Error("sensitive signing error"));
    expect((await call()).status).toBe(503);
    upstream.mockResolvedValueOnce(new Response("provider details", { status: 403 }));
    expect((await call()).status).toBe(503);
    upstream.mockResolvedValueOnce(new Response("provider details", { status: 429 }));
    const limited = await call();
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "Coinbase could not complete the sandbox request." });
    upstream.mockRejectedValueOnce(new Error("provider network error"));
    expect((await call()).status).toBe(502);
  });
});

const previewHost = "pr-645.preview.example.test";
const previewOrigin = `https://${previewHost}`;
const keys = await generateKeyPair("ES256");
const verificationKey = await exportSPKI(keys.publicKey);
async function identity(user: string, linkedAddress = address, audience = "test-app") {
  return new SignJWT({
    linked_accounts: JSON.stringify([
      { type: "wallet", wallet_client_type: "privy", chain_type: "ethereum", address: linkedAddress },
    ]),
  })
    .setIssuer("privy.io")
    .setAudience(audience)
    .setSubject(`did:privy:${user}`)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setProtectedHeader({ typ: "JWT", alg: "ES256" })
    .sign(keys.privateKey);
}
function hosted(
  body: unknown = quoteRequest,
  overrides: Record<string, string> = {},
  url = `${previewOrigin}/api/coinbase/sandbox`,
) {
  return call(body, { host: previewHost, origin: previewOrigin, "x-forwarded-proto": "https", ...overrides }, url);
}
describe("opt-in hosted sandbox", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_COINBASE_GUEST_SANDBOX", "true");
    vi.stubEnv("COINBASE_SANDBOX_PREVIEW_HOST", previewHost);
    vi.stubEnv("COINBASE_SANDBOX_PREVIEW_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "test-app");
    vi.stubEnv("NEXT_PUBLIC_PRIVY_CLIENT_ID", "test-client");
    vi.stubEnv("PRIVY_VERIFICATION_KEY", verificationKey);
  });

  it.each([
    ["VERCEL_ENV", "production"],
    ["VERCEL_ENV", "development"],
    ["NEXT_PUBLIC_COINBASE_GUEST_SANDBOX", "false"],
    ["COINBASE_SANDBOX_PREVIEW_HOST", ""],
    ["COINBASE_SANDBOX_PREVIEW_HOST", "*.preview.example.test"],
    ["COINBASE_SANDBOX_PREVIEW_HOST", previewOrigin],
  ] as const)("withholds live requests when %s is %s", async (name, value) => {
    vi.stubEnv(name, value);
    expect((await hosted()).status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
  });

  it("requires the pinned HTTPS host, exact origin and a valid identity for the requested wallet", async () => {
    const token = await identity("signed-user");
    const authorization = `Bearer ${token}`;
    expect((await hosted(quoteRequest, { host: "preview.example.test", authorization })).status).toBe(404);
    expect((await hosted(quoteRequest, { "x-forwarded-proto": "http", authorization })).status).toBe(404);
    expect((await hosted(quoteRequest, { origin: "https://other.example", authorization })).status).toBe(403);
    expect((await hosted(quoteRequest, { authorization }, `http://${previewHost}/api/coinbase/sandbox`)).status).toBe(
      404,
    );
    expect((await hosted()).status).toBe(401);
    expect(
      (await hosted(quoteRequest, { cookie: `privy-id-token=${token}`, authorization: "Bearer invalid" })).status,
    ).toBe(401);
    expect(
      (
        await hosted(quoteRequest, {
          authorization: `Bearer ${await identity("wrong-wallet", "0x2222222222222222222222222222222222222222")}`,
        })
      ).status,
    ).toBe(401);
    expect(
      (await hosted(quoteRequest, { authorization: `Bearer ${await identity("wrong-app", address, "wrong-app")}` }))
        .status,
    ).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    "COINBASE_SANDBOX_PREVIEW_ENABLED",
    "CDP_API_KEY_ID",
    "CDP_API_KEY_SECRET",
    "NEXT_PUBLIC_PRIVY_APP_ID",
    "NEXT_PUBLIC_PRIVY_CLIENT_ID",
    "PRIVY_VERIFICATION_KEY",
  ])("reports missing configuration for %s", async (key) => {
    vi.stubEnv(key, "");
    expect((await hosted()).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("creates an authenticated sandbox order with the registered domain and only simulated contacts", async () => {
    const token = await identity("hosted-order");
    expect((await hosted(quoteRequest, { authorization: `Bearer ${token}` })).status).toBe(200);
    const partner = `sandbox-${createHash("sha256").update("did:privy:hosted-order").digest("hex").slice(0, 32)}`;
    upstream.mockResolvedValueOnce(Response.json({ order: { ...order, partnerUserRef: partner }, paymentLink }));
    const request = orderRequest();
    const response = await hosted(request, { cookie: `privy-id-token=${token}` });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      quote,
      orderId: order.orderId,
      paymentUrl: `${paymentLink.url}&useApplePaySandbox=true`,
    });
    expect(JSON.parse(String(upstream.mock.lastCall?.[1]?.body))).toMatchObject({
      domain: previewHost,
      partnerUserRef: partner,
      partnerOrderRef: request.attemptId,
      isQuote: false,
      paymentAmount: "5.00",
      email: "tester@sandbox.test",
      phoneNumber: "+12025550142",
      destinationAddress: address,
      destinationNetwork: "base",
    });
    expect((await hosted(request, { authorization: `Bearer ${token}` })).status).toBe(409);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("limits repeated quote requests by signed user per minute, independently of other users", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    const first = { authorization: `Bearer ${await identity("rate-first")}` };
    for (let i = 0; i < 10; i++) expect((await hosted(quoteRequest, first)).status).toBe(200);
    expect((await hosted(quoteRequest, first)).status).toBe(429);
    expect((await hosted(quoteRequest, { authorization: `Bearer ${await identity("rate-second")}` })).status).toBe(200);
    vi.setSystemTime(Date.now() + 60_000);
    expect((await hosted(quoteRequest, first)).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(12);
  });
});
