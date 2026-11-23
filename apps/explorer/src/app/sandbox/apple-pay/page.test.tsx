import { afterEach, describe, expect, it, vi } from "vitest";
import SandboxPage from "./page";

const getHeaders = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: getHeaders }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("Not found");
  },
}));
vi.mock("./ApplePaySandbox", () => ({ default: () => null }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
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
