import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConsoleProviders from "./ConsoleProviders";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("ConsoleProviders", () => {
  it("keeps deployment details out of the missing-configuration message", () => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "");
    vi.stubEnv("NEXT_PUBLIC_PRIVY_CLIENT_ID", "");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const markup = renderToStaticMarkup(<ConsoleProviders>{null}</ConsoleProviders>);

    expect(markup).toContain("Wallet login is temporarily unavailable");
    expect(markup).toContain("Please try again later");
    expect(markup).not.toContain("NEXT_PUBLIC_PRIVY");
    expect(consoleError).toHaveBeenCalledWith("Wallet login is unavailable: missing environment variables", [
      "NEXT_PUBLIC_PRIVY_APP_ID",
      "NEXT_PUBLIC_PRIVY_CLIENT_ID",
    ]);
  });
});
