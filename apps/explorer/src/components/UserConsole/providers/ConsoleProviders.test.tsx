import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConsoleProviders, { PRIVY_DEVELOPMENT_APP, resolvePrivyApp } from "./ConsoleProviders";

const privy = vi.hoisted(() => ({ appId: "", clientId: "" }));

vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({ appId, clientId }: { appId: string; clientId: string }) => {
    privy.appId = appId;
    privy.clientId = clientId;
    return null;
  },
}));

afterEach(() => {
  privy.appId = "";
  privy.clientId = "";
  vi.unstubAllEnvs();
});

const OVERRIDE = { appId: "app-override", clientId: "client-override" };

describe("resolvePrivyApp", () => {
  it.each([
    ["off Vercel", undefined],
    ["on a preview deployment", "preview"],
    ["in Vercel development", "development"],
  ])("falls back to the development app %s", (_, deployment) => {
    expect(resolvePrivyApp({ appId: "", clientId: "", deployment })).toEqual(PRIVY_DEVELOPMENT_APP);
    expect(resolvePrivyApp({ appId: "app-override", clientId: "", deployment })).toEqual(PRIVY_DEVELOPMENT_APP);
    expect(resolvePrivyApp({ appId: "", clientId: "client-override", deployment })).toEqual(PRIVY_DEVELOPMENT_APP);
  });

  it("uses trimmed overrides in every environment", () => {
    for (const deployment of [undefined, "preview", "production"]) {
      expect(resolvePrivyApp({ appId: "  app-override  ", clientId: " client-override ", deployment })).toEqual(
        OVERRIDE,
      );
    }
  });

  it.each([
    ["both values", "", "", "set NEXT_PUBLIC_PRIVY_APP_ID and NEXT_PUBLIC_PRIVY_CLIENT_ID."],
    ["the client ID", "secret-looking-app-id", "  ", "set NEXT_PUBLIC_PRIVY_CLIENT_ID."],
    ["the app ID", undefined, "secret-looking-client-id", "set NEXT_PUBLIC_PRIVY_APP_ID."],
  ])("refuses the development app in production when %s is missing", (_, appId, clientId, message) => {
    const resolve = () => resolvePrivyApp({ appId, clientId, deployment: "production" });

    expect(resolve).toThrow(message);
    expect(resolve).not.toThrow(/secret-looking/);
  });
});

describe("ConsoleProviders", () => {
  it("hands Privy the configured app", () => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "app-override");
    vi.stubEnv("NEXT_PUBLIC_PRIVY_CLIENT_ID", "client-override");

    renderToStaticMarkup(<ConsoleProviders>{null}</ConsoleProviders>);

    expect(privy).toEqual(OVERRIDE);
  });

  it("fails a production render that has no Privy app of its own", () => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "");
    vi.stubEnv("NEXT_PUBLIC_PRIVY_CLIENT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");

    expect(() => renderToStaticMarkup(<ConsoleProviders>{null}</ConsoleProviders>)).toThrow(
      "A production deployment needs its own Privy app",
    );
    expect(privy.appId).toBe("");
  });
});
