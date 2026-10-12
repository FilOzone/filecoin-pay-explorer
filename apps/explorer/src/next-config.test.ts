import { afterEach, describe, expect, it, vi } from "vitest";

const loadConfig = async (env: { VERCEL_ENV?: string; appId: string; clientId: string }) => {
  vi.resetModules();
  vi.stubEnv("VERCEL_ENV", env.VERCEL_ENV);
  vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", env.appId);
  vi.stubEnv("NEXT_PUBLIC_PRIVY_CLIENT_ID", env.clientId);
  return import("../next.config");
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("next.config Privy guard", () => {
  it.each([
    ["both values", "", "", "set NEXT_PUBLIC_PRIVY_APP_ID and NEXT_PUBLIC_PRIVY_CLIENT_ID."],
    ["the client ID", "secret-looking-app-id", "  ", "set NEXT_PUBLIC_PRIVY_CLIENT_ID."],
    ["the app ID", "", "secret-looking-client-id", "set NEXT_PUBLIC_PRIVY_APP_ID."],
  ])("fails a production build missing %s, naming it without its values", async (_, appId, clientId, message) => {
    const load = loadConfig({ VERCEL_ENV: "production", appId, clientId });

    await expect(load).rejects.toThrow(message);
    await expect(load).rejects.not.toThrow(/secret-looking/);
  });

  it.each([
    ["off Vercel", undefined],
    ["on a preview deployment", "preview"],
  ])("builds without Privy values %s", async (_, VERCEL_ENV) => {
    await expect(loadConfig({ VERCEL_ENV, appId: "", clientId: "" })).resolves.toBeDefined();
  });

  it("builds production with both values set", async () => {
    await expect(loadConfig({ VERCEL_ENV: "production", appId: "app", clientId: "client" })).resolves.toBeDefined();
  });
});
