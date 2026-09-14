import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mainnet } from "@/constants/chains";
import { walletChains } from "@/services/wagmi/config";
import ConsoleProviders, { PRIVY_CONFIG } from "./ConsoleProviders";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Privy console configuration", () => {
  it("supports walletless login, external wallets, native confirmations, and every wallet network", () => {
    expect(PRIVY_CONFIG.loginMethods).toEqual(["email", "google", "wallet"]);
    expect(PRIVY_CONFIG.embeddedWallets).toEqual({
      showWalletUIs: true,
      ethereum: { createOnLogin: "users-without-wallets" },
    });
    expect(PRIVY_CONFIG.defaultChain.id).toBe(mainnet.id);
    expect(PRIVY_CONFIG.supportedChains.map(({ id }) => id)).toEqual(walletChains.map(({ id }) => id));
  });

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
