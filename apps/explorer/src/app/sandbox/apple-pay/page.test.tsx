import { afterEach, describe, expect, it, vi } from "vitest";
import HostedApplePaySandbox from "./HostedApplePaySandbox";
import PreviewApplePayDemo from "./PreviewApplePayDemo";
import SandboxPage from "./page";

const getHeaders = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: getHeaders }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("Not found");
  },
}));
vi.mock("./ApplePaySandbox", () => ({ default: () => null }));
vi.mock("./HostedApplePaySandbox", () => ({ default: () => null }));
vi.mock("./PreviewApplePayDemo", () => ({ default: () => null }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("shared PR checkout", () => {
  const host = "review.example.org";
  const wallet = "0x0000000000000000000000000000000000000001";
  function preview() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_COINBASE_GUEST_SANDBOX", "true");
  }
  it("opens the anonymous sample checkout with no Coinbase settings", async () => {
    preview();
    vi.stubEnv("COINBASE_SANDBOX_PREVIEW_HOST", undefined);
    const result = await page(host, "https");
    expect(result.props.children[0].type).toBe(PreviewApplePayDemo);
    expect(result.props.children[0].props.example).toBe(true);
    expect(result.props.children[1]).toBe(false);
    expect((await page(host, "https", wallet)).props.children[0].props).toEqual({ address: wallet, example: false });
  });
  it("offers the signed-wallet sandbox only after the exact host has been enabled", async () => {
    preview();
    vi.stubEnv("COINBASE_SANDBOX_PREVIEW_HOST", host);
    vi.stubEnv("COINBASE_SANDBOX_PREVIEW_ENABLED", "true");
    for (const name of [
      "CDP_API_KEY_ID",
      "CDP_API_KEY_SECRET",
      "NEXT_PUBLIC_PRIVY_APP_ID",
      "NEXT_PUBLIC_PRIVY_CLIENT_ID",
      "PRIVY_VERIFICATION_KEY",
    ])
      vi.stubEnv(name, "test-setting");
    expect((await page(host, "https", wallet)).type).toBe(HostedApplePaySandbox);
    expect((await page(host, "https", wallet)).props).toEqual({ address: wallet });
    expect((await page(host, "https")).props.children[0].type).toBe(PreviewApplePayDemo);
    expect((await page("other.example.org", "https", wallet)).props.children[0].type).toBe(PreviewApplePayDemo);
    vi.stubEnv("COINBASE_SANDBOX_PREVIEW_ENABLED", undefined);
    expect((await page(host, "https", wallet)).props.children[0].type).toBe(PreviewApplePayDemo);
  });
  it("hides the page outside an enabled preview", async () => {
    preview();
    vi.stubEnv("NEXT_PUBLIC_COINBASE_GUEST_SANDBOX", "false");
    await expect(page(host, "https")).rejects.toThrow("Not found");
    vi.stubEnv("NEXT_PUBLIC_COINBASE_GUEST_SANDBOX", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(page(host, "https")).rejects.toThrow("Not found");
  });
});

function page(host = "localhost:3105", protocol = "http", wallet?: string | string[]) {
  getHeaders.mockResolvedValue(new Headers({ host, "x-forwarded-proto": protocol }));
  return SandboxPage({ searchParams: Promise.resolve({ wallet }) });
}

describe("local Apple Pay sandbox page", () => {
  it.each([
    ["localhost", "https"],
    ["localhost.example", "http"],
    ["127.0.0.1:3105", "http"],
    ["pr-645.preview.pay.filecoin.cloud", "http"],
  ])("hides the page on %s over %s", async (host, protocol) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", undefined);
    await expect(page(host, protocol)).rejects.toThrow("Not found");
  });
  it("hides the standalone test in production even on localhost", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(page()).rejects.toThrow("Not found");
  });
  it.each([undefined, "", "  "])("passes only a disabled setup indicator for a missing secret", async (secret) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("CDP_API_KEY_ID", "fixture-id");
    vi.stubEnv("CDP_API_KEY_SECRET", secret);
    const result = await page();
    expect(result.props).toEqual({
      example: true,
      address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      configured: false,
    });
  });
  it("passes only a readiness indicator and a validated wallet address for a configured server", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("CDP_API_KEY_ID", "fixture-id");
    vi.stubEnv("CDP_API_KEY_SECRET", "fixture-secret");
    const wallet = "0x0000000000000000000000000000000000000001";
    expect((await page("localhost:3105", "http", wallet)).props).toEqual({
      example: false,
      address: wallet,
      configured: true,
    });
    await expect(page("localhost", "http", "not-a-wallet")).rejects.toThrow("Not found");
    await expect(page("localhost", "http", [wallet, wallet])).rejects.toThrow("Not found");
  });
});
