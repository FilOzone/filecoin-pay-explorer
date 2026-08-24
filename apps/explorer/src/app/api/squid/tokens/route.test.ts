import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/squid/tokens", () => {
  it("forwards the catalog request from the server and returns a cacheable response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ tokens: [] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/api/squid/tokens", { headers: { "x-integrator-id": "test" } }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://v2.api.squidrouter.com/v2/tokens",
      expect.objectContaining({ headers: { "x-integrator-id": "test" } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
    await expect(response.json()).resolves.toEqual({ tokens: [] });
  });

  it("does not cache upstream failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "busy" }), { status: 429 })),
    );

    const response = await GET(
      new Request("http://localhost/api/squid/tokens", { headers: { "x-integrator-id": "test" } }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a request without an integrator ID before calling Squid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/squid/tokens"));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
