import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { parseQuoteInput } from "@/app/api/coinbase/quote/quote";
import ApplePaySandbox from "./ApplePaySandbox";

export const metadata: Metadata = {
  title: "Apple Pay sandbox | Filecoin Pay",
  robots: { index: false, follow: false },
};

// Example destination from Coinbase’s Create Onramp Order reference. Sandbox orders never send funds.
const exampleWallet = "0x742d35cc6634c0532925a3b844bc454e4438f44e";

export default async function SandboxPage({ searchParams }: { searchParams: Promise<{ wallet?: string | string[] }> }) {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) notFound();
  const requestHeaders = await headers();
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  if (!/^localhost(:\d+)?$/.test(requestHeaders.get("host") ?? "") || proto !== "http") notFound();

  const { wallet } = await searchParams;
  const input = parseQuoteInput({ address: wallet ?? exampleWallet, paymentAmount: "5.00" });
  if (!input) notFound();
  const configured = Boolean(process.env.CDP_API_KEY_ID?.trim() && process.env.CDP_API_KEY_SECRET?.trim());
  return <ApplePaySandbox key={input.address} address={input.address} example={!wallet} configured={configured} />;
}
