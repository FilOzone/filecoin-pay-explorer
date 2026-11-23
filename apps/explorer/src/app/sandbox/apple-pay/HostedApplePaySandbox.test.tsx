// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HostedApplePaySandbox from "./HostedApplePaySandbox";

const address = "0xabcdef0000000000000000000000000000000001";
const sameAddress = "0xABCDEF0000000000000000000000000000000001";
const otherAddress = "0xabcdef0000000000000000000000000000000002";
const mocks = vi.hoisted(() => ({
  auth: { ready: true, authenticated: true },
  walletState: { ready: true, wallets: [] as { address: string; walletClientType: string }[] },
  token: vi.fn(),
  checkout: vi.fn((_props: Record<string, unknown>) => null),
}));
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mocks.auth,
  useWallets: () => mocks.walletState,
  getIdentityToken: mocks.token,
}));
vi.mock("@/components/UserConsole/providers/ConsoleProviders", () => ({
  ConsolePrivyProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./ApplePaySandbox", () => ({ default: mocks.checkout }));

beforeEach(() => {
  mocks.auth.ready = true;
  mocks.auth.authenticated = true;
  mocks.walletState.ready = true;
  mocks.walletState.wallets = [{ address: sameAddress, walletClientType: "privy" }];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("hosted Coinbase sandbox wallet gate", () => {
  it("passes the uncalled identity accessor only to checkout for the matching embedded wallet", () => {
    render(<HostedApplePaySandbox address={address} />);
    expect(mocks.checkout.mock.lastCall?.[0]).toEqual({
      address,
      configured: true,
      example: false,
      identity: mocks.token,
    });
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it.each([
    { scenario: "signed out", authenticated: false, wallet: { address: sameAddress, walletClientType: "privy" } },
    {
      scenario: "a different embedded wallet",
      authenticated: true,
      wallet: { address: otherAddress, walletClientType: "privy" },
    },
    {
      scenario: "an external wallet at the requested address",
      authenticated: true,
      wallet: { address, walletClientType: "metamask" },
    },
  ])(
    "returns $scenario to the console without mounting checkout or reading the identity token",
    ({ authenticated, wallet }) => {
      mocks.auth.authenticated = authenticated;
      mocks.walletState.wallets = [wallet];
      render(<HostedApplePaySandbox address={address} />);
      expect(screen.getByRole("link", { name: "Open the console" }).getAttribute("href")).toBe("/console");
      expect(screen.getByRole("link", { name: "Try the sample checkout" }).getAttribute("href")).toBe(
        "/sandbox/apple-pay",
      );
      expect(mocks.checkout).not.toHaveBeenCalled();
      expect(mocks.token).not.toHaveBeenCalled();
    },
  );

  it.each([
    [false, true],
    [true, false],
  ])("waits for auth and wallets before sharing the identity accessor", (authReady, walletsReady) => {
    mocks.auth.ready = authReady;
    mocks.walletState.ready = walletsReady;
    render(<HostedApplePaySandbox address={address} />);
    expect(screen.getByRole("status").textContent).toMatch(/checking your signed-in wallet/i);
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
  });
});
