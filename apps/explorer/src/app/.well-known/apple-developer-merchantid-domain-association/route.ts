import { getSandboxAccess } from "@/app/api/coinbase/sandbox/access";

// Serve the public association file byte-for-byte on the hostname registered with Coinbase.
export function GET(request: Request) {
  const access = getSandboxAccess(request.headers);
  const encoded = process.env.COINBASE_APPLE_PAY_DOMAIN_FILE_BASE64;
  const headers = { "cache-control": "no-store", "content-type": "application/octet-stream" };
  if (access?.mode !== "preview" || !encoded) return new Response(null, { status: 404, headers });
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.toString("base64") !== encoded.trim()) return new Response(null, { status: 404, headers });
  return new Response(bytes, { headers });
}
