import { createHash } from "node:crypto";
import { generateJwt } from "@coinbase/cdp-sdk/auth";
import type { NextRequest } from "next/server";
import { privyIdentityToken, verifiedUser } from "../quote/privy";
import { isRecord, parseQuoteInput, readQuote } from "../quote/quote";
import { getSandboxAccess, isHostedSandboxConfigured } from "./access";

const orders = new URL("https://api.cdp.coinbase.com/platform/v2/onramp/orders");
const applePayPage = "https://pay.coinbase.com/v2/api-onramp/apple-pay";
const noStore = { "cache-control": "no-store" };
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const maxRequestBytes = 1024;

// A partnerOrderRef is a correlation ID, not a provider idempotency guarantee.
// Retain IDs, including ambiguous failures, for this server instance. Never retain payment URLs.
const submittedAttempts = new Set<string>();

// The shared preview limits signed provider requests per Privy user within each warm server instance.
const previewRequests = new Map<string, number>();
let requestMinute = 0;
function allowPreviewRequest(userId: string) {
  const minute = Math.floor(Date.now() / 60_000);
  if (requestMinute !== minute) {
    previewRequests.clear();
    requestMinute = minute;
  }
  const count = previewRequests.get(userId) ?? 0;
  if (count >= 10 || (count === 0 && previewRequests.size >= 1024)) return false;
  previewRequests.set(userId, count + 1);
  return true;
}

function error(message: string, status: number) {
  return Response.json({ error: message }, { headers: noStore, status });
}

async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxRequestBytes) throw new RangeError();
  if (!request.body) return null;
  const reader = request.body.getReader();
  const bytes = new Uint8Array(maxRequestBytes);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.byteLength > bytes.length) {
        void reader.cancel().catch(() => {});
        throw new RangeError();
      }
      bytes.set(value, length);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
}

function sandboxPaymentUrl(link: unknown) {
  if (!isRecord(link) || link.paymentLinkType !== "PAYMENT_LINK_TYPE_APPLE_PAY_BUTTON" || typeof link.url !== "string")
    return null;
  const url = URL.parse(link.url);
  if (!url || url.username || url.password || url.hash || `${url.origin}${url.pathname}` !== applePayPage) return null;
  const tokens = url.searchParams.getAll("sessionToken");
  if (tokens.length !== 1 || !tokens[0].trim()) return null;
  // Keep Coinbase's widget parameters, such as locale. Sandbox sessions stay in this iframe.
  url.searchParams.delete("redirect_url");
  url.searchParams.set("useApplePaySandbox", "true");
  return url.href;
}

export async function POST(request: NextRequest) {
  const access = getSandboxAccess(request.headers);
  if (!access || request.nextUrl.origin !== access.origin)
    return error("This host is not configured for Coinbase sandbox sessions.", 404);
  if (request.headers.get("origin") !== access.origin) return error("Open the simulator on the same origin.", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return error("The simulator requires a JSON request.", 415);

  let body: unknown;
  try {
    body = await readBody(request);
  } catch (cause) {
    return cause instanceof RangeError
      ? error("Simulator request is too large.", 413)
      : error("Simulator request must be valid JSON.", 400);
  }
  if (!isRecord(body) || (body.action !== "quote" && body.action !== "order"))
    return error("Choose a simulator quote or order.", 400);
  const isQuote = body.action === "quote";
  const allowedFields = isQuote
    ? ["action", "address", "acceptedTerms"]
    : ["action", "address", "acceptedTerms", "attemptId"];
  if (Object.keys(body).some((key) => !allowedFields.includes(key)))
    return error("Unexpected simulator request fields.", 400);
  if (body.acceptedTerms !== true) return error("Accept the Coinbase agreements to run the sandbox simulation.", 400);
  const input = parseQuoteInput({ address: body.address, paymentAmount: "5.00" });
  if (!input) return error("Choose a valid Base wallet address.", 400);
  const attemptId =
    typeof body.attemptId === "string" && uuid.test(body.attemptId) ? body.attemptId.toLowerCase() : null;
  if (!isQuote && !attemptId) return error("The simulated order needs a checkout attempt ID.", 400);

  let sandboxUser: string = input.address;
  if (access.mode === "preview") {
    if (!isHostedSandboxConfigured())
      return error("The preview’s Coinbase or Privy sandbox integration is incomplete.", 503);
    const token = privyIdentityToken(request);
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
    const verificationKey = process.env.PRIVY_VERIFICATION_KEY?.trim();
    const userId =
      token && appId && verificationKey
        ? await verifiedUser(token, appId, verificationKey, input.address).catch(() => null)
        : null;
    if (!userId) return error("Sign in with the embedded wallet that will receive this sandbox purchase.", 401);
    if (!allowPreviewRequest(userId))
      return error("Please wait a minute before requesting another sandbox session.", 429);
    sandboxUser = userId;
  }

  const apiKeyId = process.env.CDP_API_KEY_ID?.trim();
  const apiKeySecret = process.env.CDP_API_KEY_SECRET?.trim();
  if (!apiKeyId || !apiKeySecret) return error("Set CDP_API_KEY_ID and CDP_API_KEY_SECRET on the local server.", 503);
  let jwt: string;
  try {
    jwt = await generateJwt({
      apiKeyId,
      apiKeySecret,
      requestMethod: "POST",
      requestHost: orders.host,
      requestPath: orders.pathname,
    });
  } catch {
    return error("The CDP credentials could not sign the sandbox request.", 503);
  }

  const now = new Date().toISOString();
  const partnerUserRef = `sandbox-${createHash("sha256").update(sandboxUser).digest("hex").slice(0, 32)}`;
  if (attemptId) {
    const key = `${partnerUserRef}:${attemptId}`;
    if (submittedAttempts.has(key))
      return error("This sandbox attempt was already submitted. Resume the original session.", 409);
    // Keep the simulator bounded without evicting previous attempts and making them replayable.
    if (submittedAttempts.size >= 1024) return error("This server instance has reached its sandbox order limit.", 429);
    submittedAttempts.add(key);
  }

  try {
    const upstream = await fetch(orders, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({
        isQuote,
        partnerUserRef,
        ...(attemptId && { partnerOrderRef: attemptId }),
        paymentAmount: input.paymentAmount,
        paymentCurrency: "USD",
        paymentMethod: "GUEST_CHECKOUT_APPLE_PAY",
        purchaseCurrency: "USDC",
        destinationAddress: input.address,
        destinationNetwork: "base",
        domain: access.domain,
        // Standard sandbox orders require simulated contacts, a verification time and a test public IP.
        email: "tester@sandbox.test",
        phoneNumber: "+12025550142",
        phoneNumberVerifiedAt: now,
        agreementAcceptedAt: now,
        clientIp: "192.0.2.1",
      }),
    });
    if (!upstream.ok) {
      if (upstream.status === 401 || upstream.status === 403)
        return error("Coinbase did not authorize this CDP key for the sandbox request.", 503);
      return error("Coinbase could not complete the sandbox request.", upstream.status >= 400 ? upstream.status : 502);
    }
    const result: unknown = await upstream.json();
    const quote = readQuote(result, input);
    if (!quote) return error("Coinbase returned mismatched sandbox purchase terms.", 502);
    if (isQuote) return Response.json({ quote }, { headers: noStore });
    if (
      !isRecord(result) ||
      !isRecord(result.order) ||
      (result.order.partnerUserRef !== undefined && result.order.partnerUserRef !== partnerUserRef)
    )
      return error("Coinbase returned a different sandbox user for this order.", 502);
    const paymentUrl = sandboxPaymentUrl(result.paymentLink);
    const orderId = result.order.orderId;
    if (!paymentUrl || typeof orderId !== "string" || !uuid.test(orderId))
      return error("Coinbase did not return a valid sandbox Apple Pay session.", 502);
    return Response.json({ quote, orderId, paymentUrl }, { headers: noStore });
  } catch (cause) {
    return cause instanceof DOMException && cause.name === "TimeoutError"
      ? error("The Coinbase sandbox request timed out.", 504)
      : error("Coinbase sandbox is unavailable.", 502);
  }
}
