import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseQuoteInput } from "@/app/api/coinbase/quote/quote";
import { getSandboxAccess, isHostedSandboxConfigured } from "@/app/api/coinbase/sandbox/access";
import ApplePaySandbox from "./ApplePaySandbox";
import HostedApplePaySandbox from "./HostedApplePaySandbox";
import PreviewApplePayDemo from "./PreviewApplePayDemo";

export const metadata: Metadata = {
  title: "Apple Pay sandbox | Filecoin Pay",
  robots: { index: false, follow: false },
};

// Example destination from Coinbase’s Create Onramp Order reference. Sandbox orders never send funds.
const exampleWallet = "0x742d35cc6634c0532925a3b844bc454e4438f44e";

export default async function SandboxPage({ searchParams }: { searchParams: Promise<{ wallet?: string | string[] }> }) {
  const access = getSandboxAccess(await headers());
  const sharedPreview =
    process.env.VERCEL_ENV === "preview" && process.env.NEXT_PUBLIC_COINBASE_GUEST_SANDBOX === "true";
  if (!access && !sharedPreview) notFound();

  const { wallet } = await searchParams;
  const input = parseQuoteInput({ address: wallet ?? exampleWallet, paymentAmount: "5.00" });
  if (!input) notFound();
  if (sharedPreview) {
    const providerReady = access?.mode === "preview" && isHostedSandboxConfigured();
    if (providerReady && wallet) return <HostedApplePaySandbox address={input.address} />;
    return (
      <>
        <PreviewApplePayDemo key={input.address} address={input.address} example={!wallet} />
        {providerReady && (
          <p className='mx-auto max-w-lg px-5 pb-6 text-sm'>
            <Link className='underline' href='/console'>
              Use your signed-in wallet to try the Coinbase sandbox
            </Link>
          </p>
        )}
      </>
    );
  }
  const configured = Boolean(process.env.CDP_API_KEY_ID?.trim() && process.env.CDP_API_KEY_SECRET?.trim());
  return <ApplePaySandbox key={input.address} address={input.address} example={!wallet} configured={configured} />;
}
