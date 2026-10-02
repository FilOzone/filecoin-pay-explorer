import type { ReactNode } from "react";
import { act, create } from "react-test-renderer";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleAccountProvider, useConsoleAccount } from "./ConsoleAccountContext";

type WalletStub = { address: string; walletClientType: string };
type Selector = (params: { wallets: WalletStub[]; user: null }) => WalletStub | undefined;

const EMBEDDED = { address: "0x1111111111111111111111111111111111111111", walletClientType: "privy" };
const METAMASK = { address: "0x2222222222222222222222222222222222222222", walletClientType: "metamask" };
const OTHER_METAMASK = { address: "0x3333333333333333333333333333333333333333", walletClientType: "metamask" };
const STORAGE_KEY = "filecoin-pay:console-account:v1";

const mocks = vi.hoisted(() => ({
  user: null as null | { linkedAccounts: object[]; wallet?: { address: string; walletClientType?: string } },
  address: undefined as string | undefined,
  logout: vi.fn(async () => undefined),
  setActiveWallet: vi.fn(async () => undefined),
  selector: undefined as Selector | undefined,
  wallets: [] as WalletStub[],
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ authenticated: mocks.user !== null, user: mocks.user, logout: mocks.logout }),
  useWallets: () => ({ wallets: mocks.wallets }),
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));
vi.mock("@privy-io/wagmi", () => ({
  WagmiProvider: ({
    children,
    setActiveWalletForWagmi,
  }: {
    children: ReactNode;
    setActiveWalletForWagmi: Selector;
  }) => {
    mocks.selector = setActiveWalletForWagmi;
    return children;
  },
  useSetActiveWallet: () => ({ setActiveWallet: mocks.setActiveWallet }),
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ address: mocks.address }) }));
vi.mock("@/services/wagmi/config", () => ({ config: {} }));

const stored = new Map<string, string>();

let latest!: ReturnType<typeof useConsoleAccount>;
function Probe() {
  latest = useConsoleAccount();
  return null;
}

const render = () =>
  act(() => {
    create(
      <ConsoleAccountProvider>
        <Probe />
      </ConsoleAccountProvider>,
    );
  });

const selectForWagmi = (wallets: WalletStub[]) => mocks.selector?.({ wallets, user: null });

beforeEach(() => {
  vi.clearAllMocks();
  stored.clear();
  mocks.user = null;
  mocks.wallets = [];
  mocks.address = undefined;
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      removeItem: (key: string) => stored.delete(key),
      setItem: (key: string, value: string) => stored.set(key, value),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("ConsoleAccountProvider", () => {
  it("starts without an account and connects no wallet to wagmi", () => {
    render();

    expect(latest.account).toBeNull();
    expect(selectForWagmi([EMBEDDED, METAMASK])).toBeUndefined();
  });

  it("uses the embedded wallet of an email or Google login", () => {
    mocks.user = { linkedAccounts: [{ type: "email" }, { type: "wallet", ...EMBEDDED }], wallet: EMBEDDED };
    render();

    expect(latest.account).toEqual(EMBEDDED);
  });

  it("uses the wallet a login verified when the user has no embedded wallet", () => {
    mocks.user = { linkedAccounts: [{ type: "wallet", ...METAMASK }], wallet: METAMASK };
    render();

    expect(latest.account).toEqual(METAMASK);
  });

  it("keeps wagmi on the console account however many wallets connect, in any order", () => {
    render();
    act(() => latest.selectAccount(METAMASK));

    expect(selectForWagmi([METAMASK])).toBe(METAMASK);
    expect(selectForWagmi([EMBEDDED, METAMASK])).toBe(METAMASK);
    expect(selectForWagmi([METAMASK, EMBEDDED])).toBe(METAMASK);
  });

  it("matches the account's wallet regardless of address case", () => {
    render();
    act(() =>
      latest.selectAccount({ address: "0xabcdef0000000000000000000000000000000001", walletClientType: "metamask" }),
    );
    const checksummed = { address: "0xABCDEF0000000000000000000000000000000001", walletClientType: "metamask" };

    expect(selectForWagmi([checksummed])).toBe(checksummed);
  });

  it("disconnects wagmi instead of following the extension to another account", () => {
    render();
    act(() => latest.selectAccount(METAMASK));

    expect(selectForWagmi([OTHER_METAMASK, EMBEDDED])).toBeUndefined();
  });

  it("keeps a chosen account over the Privy login, and restores it after a reload", () => {
    mocks.user = { linkedAccounts: [{ type: "wallet", ...EMBEDDED }], wallet: EMBEDDED };
    render();
    act(() => latest.selectAccount(METAMASK));
    expect(latest.account).toEqual(METAMASK);

    render();
    expect(latest.account).toEqual(METAMASK);
  });

  it("forgets the chosen account on exit", () => {
    render();
    act(() => latest.selectAccount(METAMASK));
    act(() => latest.clearAccount());

    expect(latest.account).toBeNull();
    expect(stored.has(STORAGE_KEY)).toBe(false);
  });

  it("ignores a stored value that is not an account", () => {
    stored.set(STORAGE_KEY, JSON.stringify({ address: "not-an-address", walletClientType: "metamask" }));
    render();

    expect(latest.account).toBeNull();
  });
});

describe("KeepConsoleWallet", () => {
  const RABBY = { address: "0x4444444444444444444444444444444444444444", walletClientType: "rabby_wallet" };

  it("follows the account's extension to its new account and says so", () => {
    render();
    act(() => latest.selectAccount(METAMASK));
    mocks.wallets = [EMBEDDED, OTHER_METAMASK];
    render();

    expect(latest.account).toEqual(OTHER_METAMASK);
    expect(toast.info).toHaveBeenCalledOnce();
    expect(toast.info).toHaveBeenCalledWith("Switched to 0x3333...3333", {
      description: "Your wallet changed accounts.",
    });
  });

  it("stays on the account while its wallet is connected, whatever else connects", () => {
    render();
    act(() => latest.selectAccount(METAMASK));
    mocks.wallets = [RABBY, METAMASK, EMBEDDED];
    render();

    expect(latest.account).toEqual(METAMASK);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("does not follow a different extension when the account's own wallet is locked", () => {
    render();
    act(() => latest.selectAccount(METAMASK));
    mocks.wallets = [RABBY];
    render();

    expect(latest.account).toEqual(METAMASK);
  });

  it("never replaces an embedded wallet that is still being created", () => {
    mocks.user = { linkedAccounts: [{ type: "email" }, { type: "wallet", ...EMBEDDED }], wallet: EMBEDDED };
    mocks.wallets = [{ address: OTHER_METAMASK.address, walletClientType: "privy" }];
    render();

    expect(latest.account).toEqual(EMBEDDED);
  });

  it("ends a wallet's login once the console follows the extension to another account", () => {
    mocks.user = { linkedAccounts: [{ type: "wallet", ...METAMASK }], wallet: METAMASK };
    mocks.wallets = [OTHER_METAMASK];
    render();

    expect(latest.account).toEqual(OTHER_METAMASK);
    expect(mocks.logout).toHaveBeenCalled();
  });

  it("keeps an email login while the console uses a wallet it did not verify", () => {
    mocks.user = { linkedAccounts: [{ type: "email" }, { type: "wallet", ...EMBEDDED }], wallet: EMBEDDED };
    render();
    act(() => latest.selectAccount(METAMASK));

    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it("puts wagmi back on the account when a stale reconnect lands on another wallet", () => {
    render();
    act(() => latest.selectAccount(METAMASK));
    mocks.wallets = [EMBEDDED, METAMASK];
    mocks.address = EMBEDDED.address;
    render();

    expect(mocks.setActiveWallet).toHaveBeenCalledWith(METAMASK);
  });

  it("leaves wagmi alone while it holds the account", () => {
    render();
    act(() => latest.selectAccount(METAMASK));
    mocks.wallets = [EMBEDDED, METAMASK];
    mocks.address = METAMASK.address;
    render();

    expect(mocks.setActiveWallet).not.toHaveBeenCalled();
  });
});
