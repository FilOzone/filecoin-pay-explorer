import { createHash } from "node:crypto";
import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { importSPKI, jwtVerify } from "jose";
import { isRecord, parseQuoteInput, readQuote } from "./quote";

const orders = new URL("https://api.cdp.coinbase.com/platform/v2/onramp/orders");
const noStore = { "cache-control": "no-store" };

function error(message: string, status: number) {
  return Response.json({ error: message }, { headers: noStore, status });
}

async function verifiedUser(token: string, appId: string, verificationKey: string, address: string) {
  const key = await importSPKI(verificationKey.replaceAll("\\n", "\n"), "ES256");
  const { payload } = await jwtVerify(token, key, {
    typ: "JWT",
    algorithms: ["ES256"],
    issuer: "privy.io",
    audience: appId,
    requiredClaims: ["exp", "sub", "iat", "linked_accounts"],
  });
  if (!payload.sub?.startsWith("did:privy:") || typeof payload.linked_accounts !== "string") return null;
  const accounts: unknown = JSON.parse(payload.linked_accounts);
  const ownsWallet =
    Array.isArray(accounts) &&
    accounts.some(
      (account: unknown) =>
        isRecord(account) &&
        account.type === "wallet" &&
        account.chain_type === "ethereum" &&
        account.wallet_client_type === "privy" &&
        typeof account.address === "string" &&
        account.address.toLowerCase() === address.toLowerCase(),
    );
  return ownsWallet ? payload.sub : null;
}

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_COINBASE_GUEST_SANDBOX !== "true")
    return error("Coinbase sandbox preview is disabled.", 404);
  const apiKeyId = process.env.CDP_API_KEY_ID?.trim();
  const apiKeySecret = process.env.CDP_API_KEY_SECRET?.trim();
  if (!apiKeyId || !apiKeySecret)
    return error("Coinbase sandbox quotes require CDP_API_KEY_ID and CDP_API_KEY_SECRET.", 503);
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  const verificationKey = process.env.PRIVY_VERIFICATION_KEY?.trim();
  if (!appId || !verificationKey)
    return error("Sandbox wallet verification requires NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_VERIFICATION_KEY.", 503);

  if (Number(request.headers.get("content-length")) > 1024) return error("Quote request is too large.", 413);
  const raw = await request.text();
  if (raw.length > 1024) return error("Quote request is too large.", 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return error("Quote request must be valid JSON.", 400);
  }
  const input = parseQuoteInput(body);
  if (!input) return error("Choose an embedded wallet and an amount from $5 to $50.", 400);
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return error("Sign in to verify the destination wallet.", 401);
  const userId = await verifiedUser(token, appId, verificationKey, input.address).catch(() => null);
  if (!userId) return error("The signed-in session could not verify this embedded wallet.", 401);

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
    return error("Coinbase sandbox credentials could not sign the quote request.", 503);
  }
  try {
    const upstream = await fetch(orders, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({
        isQuote: true,
        partnerUserRef: `sandbox-${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`,
        paymentAmount: input.paymentAmount,
        destinationAddress: input.address,
        destinationNetwork: "base",
        paymentCurrency: "USD",
        purchaseCurrency: "USDC",
        paymentMethod: "GUEST_CHECKOUT_APPLE_PAY",
      }),
    });
    if (!upstream.ok) {
      const status = upstream.status;
      if (status === 401 || status === 403) return error("Coinbase did not authorize the sandbox quote request.", 503);
      return error("Coinbase could not quote this purchase.", status >= 400 && status <= 599 ? status : 502);
    }
    const quote = readQuote(await upstream.json(), input);
    if (!quote) return error("Coinbase returned an incomplete or mismatched quote.", 502);
    return Response.json(quote, { headers: noStore });
  } catch (cause) {
    return cause instanceof DOMException && cause.name === "TimeoutError"
      ? error("The Coinbase quote timed out.", 504)
      : error("Coinbase sandbox quotes are unavailable.", 502);
  }
}
