import { createHash, randomUUID } from "node:crypto";
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
  const request = new Request(url, {
    method: "POST",
    headers: { ...headers, ...headerOverrides },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(request);
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("CDP_API_KEY_ID", "test-key");
  vi.stubEnv("CDP_API_KEY_SECRET", "test-secret");
  vi.stubGlobal("fetch", upstream);
  sign.mockResolvedValue("scoped-test-jwt");
  upstream.mockImplementation(async () => Response.json({ order, paymentLink, userAuthToken: "private-token" }));
});
afterEach(() => {
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
    [api.replace("localhost", "127.0.0.1"), {}, 404],
    [api.replace("http:", "https:"), {}, 404],
    [api, { origin: "http://localhost:3031" }, 403],
    [api, { host: "preview.example" }, 403],
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
