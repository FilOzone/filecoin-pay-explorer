import { parseUnits } from "viem";
import { type GuestCoinbaseQuote, isRecord } from "@/app/api/coinbase/quote/quote";

export const coinbaseOrigin = "https://pay.coinbase.com";
export type SandboxOrder = { orderId: string; paymentUrl: string; quote: GuestCoinbaseQuote };

export type Attempt = {
  attemptId: string;
  approved: GuestCoinbaseQuote;
  order?: SandboxOrder;
  status: "creating" | "open" | "processing" | "complete";
};

export function isQuote(value: unknown): value is GuestCoinbaseQuote {
  return (
    isRecord(value) &&
    typeof value.paymentTotal === "string" &&
    /^5(?:\.00?)?$/.test(value.paymentTotal) &&
    typeof value.feeTotal === "string" &&
    /^\d{1,3}(?:\.\d{1,2})?$/.test(value.feeTotal) &&
    typeof value.purchaseAmount === "string" &&
    /^\d{1,3}(?:\.\d{1,6})?$/.test(value.purchaseAmount)
  );
}

export function sameQuote(a: GuestCoinbaseQuote, b: GuestCoinbaseQuote) {
  return (
    parseUnits(a.paymentTotal, 2) === parseUnits(b.paymentTotal, 2) &&
    parseUnits(a.feeTotal, 2) === parseUnits(b.feeTotal, 2) &&
    parseUnits(a.purchaseAmount, 6) === parseUnits(b.purchaseAmount, 6)
  );
}

export function isOrder(value: unknown): value is SandboxOrder {
  if (
    !isRecord(value) ||
    !isQuote(value.quote) ||
    typeof value.orderId !== "string" ||
    !value.orderId ||
    typeof value.paymentUrl !== "string"
  )
    return false;
  let url: URL;
  try {
    url = new URL(value.paymentUrl);
  } catch {
    return false;
  }
  return (
    url.origin === coinbaseOrigin &&
    !url.username &&
    !url.password &&
    !url.hash &&
    url.pathname === "/v2/api-onramp/apple-pay" &&
    !url.searchParams.has("redirect_url") &&
    url.searchParams.getAll("sessionToken").length === 1 &&
    url.searchParams.getAll("useApplePaySandbox").length === 1 &&
    url.searchParams.get("useApplePaySandbox") === "true" &&
    !!url.searchParams.get("sessionToken")?.trim()
  );
}

export function readAttempt(key: string): Attempt | null {
  const raw = sessionStorage.getItem(key);
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (isRecord(value) && typeof value.attemptId === "string" && isQuote(value.approved)) {
    const { status, order, approved, attemptId } = value;
    if (status === "creating" && order === undefined) return { attemptId, approved, status };
    if ((status === "open" || status === "processing" || status === "complete") && isOrder(order))
      return { attemptId, approved, status, order };
  }
  throw new Error("The saved test order could not be restored. Open a new tab to start a separate test.");
}
