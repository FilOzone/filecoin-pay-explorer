const SQUID_TOKENS_URL = "https://v2.api.squidrouter.com/v2/tokens";
const SQUID_TOKENS_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600";

export async function GET(request: Request) {
  const integratorId = request.headers.get("x-integrator-id")?.trim();
  if (!integratorId) {
    return Response.json(
      { error: "Squid integrator ID is required" },
      { headers: { "cache-control": "no-store" }, status: 400 },
    );
  }

  try {
    const upstream = await fetch(SQUID_TOKENS_URL, {
      headers: { "x-integrator-id": integratorId },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      headers: {
        "cache-control": upstream.ok ? SQUID_TOKENS_CACHE_CONTROL : "no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
      status: upstream.status,
    });
  } catch (error) {
    console.error("Failed to proxy Squid token catalog:", error);
    return Response.json(
      { error: "Squid token catalog is unavailable" },
      { headers: { "cache-control": "no-store" }, status: 502 },
    );
  }
}
