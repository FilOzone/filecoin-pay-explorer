import { describe, expect, it } from "vitest";
import { mainnet } from "@/constants/chains";
import { walletChains } from "@/services/wagmi/config";
import { PRIVY_CONFIG } from "./ConsoleProviders";

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
});
