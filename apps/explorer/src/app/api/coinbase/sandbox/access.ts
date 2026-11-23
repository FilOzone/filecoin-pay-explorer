// Server-side only. The operator pins a single hostname that Coinbase has registered for web embedding.
export function getHostedSandboxDomain() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.NEXT_PUBLIC_COINBASE_GUEST_SANDBOX !== "true") return null;
  const domain = process.env.COINBASE_SANDBOX_PREVIEW_HOST?.trim().toLowerCase();
  if (!domain || domain.length > 253 || !/^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/.test(domain))
    return null;
  return domain;
}

export function isHostedSandboxConfigured() {
  return Boolean(
    process.env.COINBASE_SANDBOX_PREVIEW_ENABLED === "true" &&
      process.env.CDP_API_KEY_ID?.trim() &&
      process.env.CDP_API_KEY_SECRET?.trim() &&
      process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() &&
      process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID?.trim() &&
      process.env.PRIVY_VERIFICATION_KEY?.trim(),
  );
}

export function getSandboxAccess(headers: Pick<Headers, "get">) {
  const host = headers.get("host");
  const protocol = headers.get("x-forwarded-proto");
  if (
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    !process.env.VERCEL_ENV &&
    host &&
    /^localhost(:\d+)?$/.test(host) &&
    (protocol ?? "http") === "http"
  )
    return { mode: "local" as const, origin: `http://${host}`, domain: "localhost" };
  const domain = getHostedSandboxDomain();
  if (domain && host === domain && protocol === "https")
    return { mode: "preview" as const, origin: `https://${domain}`, domain };
  return null;
}
