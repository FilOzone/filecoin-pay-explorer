import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const host = "review.example.org";
const request = (domain: string) =>
  new Request(`https://${domain}/.well-known/apple-developer-merchantid-domain-association`, {
    headers: { host: domain, "x-forwarded-proto": "https" },
  });
afterEach(() => vi.unstubAllEnvs());

it("serves the unmodified public verification bytes on the registered PR hostname only", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("NEXT_PUBLIC_COINBASE_GUEST_SANDBOX", "true");
  vi.stubEnv("COINBASE_SANDBOX_PREVIEW_HOST", host);
  const bytes = Buffer.from("example association file\n");
  vi.stubEnv("COINBASE_APPLE_PAY_DOMAIN_FILE_BASE64", bytes.toString("base64"));
  const response = GET(request(host));
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(GET(request("different.example.org")).status).toBe(404);
  vi.stubEnv("VERCEL_ENV", "production");
  expect(GET(request(host)).status).toBe(404);
});

it("keeps missing or malformed verification content unavailable", () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("NEXT_PUBLIC_COINBASE_GUEST_SANDBOX", "true");
  vi.stubEnv("COINBASE_SANDBOX_PREVIEW_HOST", host);
  for (const value of [undefined, "", "???"]) {
    vi.stubEnv("COINBASE_APPLE_PAY_DOMAIN_FILE_BASE64", value);
    expect(GET(request(host)).status).toBe(404);
  }
});
