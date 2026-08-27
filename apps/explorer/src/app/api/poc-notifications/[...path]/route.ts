import { type NextRequest, NextResponse } from "next/server";

/**
 * POC-only stand-in for the notification-service API, so the Email Alerts page
 * and the Warm Storage POC demo end-to-end without running the Cloudflare
 * workers (D1, wrangler) locally. Point NEXT_PUBLIC_NOTIFICATIONS_API_URL at
 * /api/poc-notifications to use it. In-memory: state resets with the dev
 * server. No signature verification: never deploy this.
 */

const subscribedWallets = new Set<string>();

const notInProduction = () =>
  process.env.NODE_ENV === "production" ? NextResponse.json({ error: "not found" }, { status: 404 }) : null;

const walletFromSiweMessage = (message: string): string | null =>
  message.match(/0x[a-fA-F0-9]{40}/)?.[0]?.toLowerCase() ?? null;

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const blocked = notInProduction();
  if (blocked) return blocked;
  const { path } = await params;
  if (path.join("/") !== "status") return NextResponse.json({ error: "not found" }, { status: 404 });

  const wallet = request.nextUrl.searchParams.get("wallet")?.toLowerCase();
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });
  return NextResponse.json({ subscribed: subscribedWallets.has(wallet) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const blocked = notInProduction();
  if (blocked) return blocked;
  const { path } = await params;
  const endpoint = path.join("/");
  const body: unknown = await request.json().catch(() => null);
  const message =
    typeof (body as Record<string, unknown>)?.message === "string"
      ? String((body as Record<string, unknown>).message)
      : "";
  const wallet = walletFromSiweMessage(message);
  if (!wallet) return NextResponse.json({ error: "no wallet address in message" }, { status: 400 });

  if (endpoint === "register") {
    subscribedWallets.add(wallet);
    return NextResponse.json({ ok: true });
  }
  if (endpoint === "unsubscribe") {
    subscribedWallets.delete(wallet);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "not found" }, { status: 404 });
}
