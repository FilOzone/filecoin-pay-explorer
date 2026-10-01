import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConsoleProviders, { KeepConsoleWallet, PRIVY_DEVELOPMENT_APP } from "./ConsoleProviders";

const privy = vi.hoisted(() => ({ appId: "", clientId: "" }));
const session = vi.hoisted(() => ({
  address: undefined as string | undefined,
  authenticated: false,
  linkedAccounts: [] as { type: string; address?: string }[],
  logout: vi.fn(async () => undefined),
  setActiveWallet: vi.fn(async () => undefined),
  wallets: [] as { address: string; walletClientType: string }[],
}));

vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({ appId, clientId }: { appId: string; clientId: string }) => {
    privy.appId = appId;
    privy.clientId = clientId;
    return null;
  },
  usePrivy: () => ({
    authenticated: session.authenticated,
    user: session.authenticated ? { linkedAccounts: session.linkedAccounts } : null,
    logout: session.logout,
  }),
  useWallets: () => ({ wallets: session.wallets }),
}));
vi.mock("@privy-io/wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@privy-io/wagmi")>()),
  useSetActiveWallet: () => ({ setActiveWallet: session.setActiveWallet }),
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ address: session.address }) }));

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

describe("KeepConsoleWallet", () => {
  const EMBEDDED = { address: "0xAAA", walletClientType: "privy" };
  const EXTENSION = { address: "0xBBB", walletClientType: "metamask" };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(session, { address: undefined, authenticated: false, linkedAccounts: [], wallets: [] });
  });

  const render = async () => {
    await act(async () => {
      create(<KeepConsoleWallet />);
    });
  };

  it("puts wagmi back on the embedded wallet when a stale reconnect lands on the extension", async () => {
    Object.assign(session, { address: EXTENSION.address, wallets: [EXTENSION, EMBEDDED] });
    await render();
    expect(session.setActiveWallet).toHaveBeenCalledWith(EMBEDDED);
  });

  it("leaves wagmi alone when it already holds the selected wallet", async () => {
    Object.assign(session, { address: EMBEDDED.address, wallets: [EXTENSION, EMBEDDED] });
    await render();
    expect(session.setActiveWallet).not.toHaveBeenCalled();
  });

  it("ends a wallet's login once the console follows the extension to another account", async () => {
    Object.assign(session, {
      address: EXTENSION.address,
      authenticated: true,
      linkedAccounts: [{ type: "wallet", address: "0xCCC" }],
      wallets: [EXTENSION],
    });
    await render();
    expect(session.logout).toHaveBeenCalledOnce();
  });

  it("keeps an email login while its embedded wallet is still being created", async () => {
    Object.assign(session, {
      address: EXTENSION.address,
      authenticated: true,
      linkedAccounts: [{ type: "email" }],
      wallets: [EXTENSION],
    });
    await render();
    expect(session.logout).not.toHaveBeenCalled();
  });
});
