import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConsoleProviders from "./ConsoleProviders";

const privy = vi.hoisted(() => ({ appId: "", clientId: "" }));

vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({ appId, clientId }: { appId: string; clientId: string }) => {
    privy.appId = appId;
    privy.clientId = clientId;
    return null;
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ConsoleProviders", () => {
  it.each([
    [
      "development fallbacks",
      "",
      "",
      "cmtkfb83p04du0bk0kofldq4e",
      "client-WY6d6QKpTJMyLAHudjThbGxFZiCsX4oQwkvMVSLRUKmLf",
    ],
    ["deployment overrides", "app-override", "client-override", "app-override", "client-override"],
  ])("uses %s", (_, appId, clientId, expectedAppId, expectedClientId) => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", appId);
    vi.stubEnv("NEXT_PUBLIC_PRIVY_CLIENT_ID", clientId);

    renderToStaticMarkup(<ConsoleProviders>{null}</ConsoleProviders>);

    expect(privy).toEqual({ appId: expectedAppId, clientId: expectedClientId });
  });
});
