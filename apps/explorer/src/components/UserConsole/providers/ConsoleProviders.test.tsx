import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConsoleProviders, { PRIVY_DEVELOPMENT_APP } from "./ConsoleProviders";

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

describe("ConsoleProviders", () => {
  it.each([
    ["development fallbacks", "", "", PRIVY_DEVELOPMENT_APP],
    ["development fallbacks when only the app ID is configured", "app-override", "", PRIVY_DEVELOPMENT_APP],
    ["development fallbacks when only the client ID is configured", "", "client-override", PRIVY_DEVELOPMENT_APP],
    [
      "trimmed deployment overrides",
      "  app-override  ",
      "  client-override  ",
      { appId: "app-override", clientId: "client-override" },
    ],
  ])("uses %s", (_, appId, clientId, expected) => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", appId);
    vi.stubEnv("NEXT_PUBLIC_PRIVY_CLIENT_ID", clientId);

    renderToStaticMarkup(<ConsoleProviders>{null}</ConsoleProviders>);

    expect(privy).toEqual(expected);
  });
});
