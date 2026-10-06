import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ConsoleContent } from "./(console)/ConsoleContent";
import { ConsoleWalletControls } from "./(console)/ConsoleWalletControls";
import {
  getConsoleAccessState,
  getConsoleAccountState,
  getConsoleDisplayAccessState,
  keepReadyThroughResync,
  rememberReadyConnection,
} from "./(console)/console-access";

vi.mock("@/components/shared/Balance", () => ({ default: () => <span>Filecoin balance</span> }));
vi.mock("@/components/shared/ChainSwitcher", () => ({ default: () => <span>Filecoin network</span> }));

describe("console account", () => {
  const ACCOUNT = "0x00000000000000000000000000000000000000aA";
  const OTHER = "0x00000000000000000000000000000000000000bb";
  const external = { address: ACCOUNT, walletClientType: "metamask" };
  const embedded = { address: ACCOUNT, walletClientType: "privy" };

  it("waits for Privy's wallets before hydration, even with no account, so the server and client render the same card", () => {
    expect(
      getConsoleAccountState({
        hydrated: false,
        privyFailed: false,
        account: external,
        address: ACCOUNT,
        wallets: [],
        walletsReady: false,
      }),
    ).toBe("connecting");
    expect(
      getConsoleAccountState({
        hydrated: false,
        privyFailed: false,
        account: null,
        address: undefined,
        wallets: [],
        walletsReady: false,
      }),
    ).toBe("connecting");
  });

  it("waits for Privy's wallets while a stored account is set", () => {
    expect(
      getConsoleAccountState({
        hydrated: true,
        privyFailed: false,
        account: external,
        address: undefined,
        wallets: [],
        walletsReady: false,
      }),
    ).toBe("connecting");
  });

  it("leaves the connecting card once an exit clears the account, even if wallets never load", () => {
    expect(
      getConsoleAccountState({
        hydrated: true,
        privyFailed: false,
        account: null,
        address: undefined,
        wallets: [],
        walletsReady: false,
      }),
    ).toBe("none");
  });

  it("shows the gate, which explains the failure, when Privy cannot start", () => {
    expect(
      getConsoleAccountState({
        hydrated: true,
        privyFailed: true,
        account: external,
        address: undefined,
        wallets: [],
        walletsReady: false,
      }),
    ).toBe("none");
  });

  it("shows the gate without an account", () => {
    expect(
      getConsoleAccountState({
        hydrated: true,
        privyFailed: false,
        account: null,
        address: OTHER,
        wallets: [],
        walletsReady: true,
      }),
    ).toBe("none");
  });

  it("is active only while wagmi is on the console account", () => {
    expect(
      getConsoleAccountState({
        hydrated: true,
        privyFailed: false,
        account: external,
        address: ACCOUNT.toLowerCase(),
        wallets: [{ address: ACCOUNT, walletClientType: "metamask" }],
        walletsReady: true,
      }),
    ).toBe("active");
  });

  it("stops rendering the moment the extension moves wagmi to another address", () => {
    // wagmi follows the extension before Privy drops the old account, so the account is still listed.
    expect(
      getConsoleAccountState({
        hydrated: true,
        privyFailed: false,
        account: external,
        address: OTHER,
        wallets: [{ address: ACCOUNT, walletClientType: "metamask" }],
        walletsReady: true,
      }),
    ).toBe("connecting");
  });

  it("waits while the console follows the extension to its new account", () => {
    expect(
      getConsoleAccountState({
        hydrated: true,
        privyFailed: false,
        account: external,
        address: undefined,
        wallets: [{ address: OTHER, walletClientType: "metamask" }],
        walletsReady: true,
      }),
    ).toBe("connecting");
  });

  it("reports the account as unavailable when its extension exposes no account", () => {
    expect(
      getConsoleAccountState({
        hydrated: true,
        privyFailed: false,
        account: external,
        address: undefined,
        wallets: [{ address: OTHER, walletClientType: "privy" }],
        walletsReady: true,
      }),
    ).toBe("unavailable");
    expect(
      getConsoleAccountState({
        hydrated: true,
        privyFailed: false,
        account: external,
        address: undefined,
        wallets: [],
        walletsReady: true,
      }),
    ).toBe("unavailable");
  });

  it("treats a missing embedded wallet as not ready yet, since it cannot switch accounts", () => {
    expect(
      getConsoleAccountState({
        hydrated: true,
        privyFailed: false,
        account: embedded,
        address: undefined,
        wallets: [],
        walletsReady: true,
      }),
    ).toBe("none");
  });

  it.each([
    ["none", "not-connected"],
    ["unavailable", "account-unavailable"],
    ["connecting", "reconnecting"],
  ] as const)("keeps pages unmounted while the account is %s", (accountState, expected) => {
    expect(getConsoleAccessState({ accountState, isConnected: true, hasAddress: true, chainId: 314 })).toBe(expected);
  });
});

describe("console access and continuity", () => {
  it("does not expose a default-chain console while the selected wallet reconnects", () => {
    expect(
      getConsoleAccessState({
        accountState: "active",
        isConnected: true,
        isReconnecting: true,
        hasAddress: true,
        chainId: 314159,
      }),
    ).toBe("reconnecting");
  });

  it("keeps the console page mounted on a Squid source chain", () => {
    expect(getConsoleAccessState({ accountState: "active", isConnected: true, hasAddress: true, chainId: 8453 })).toBe(
      "squid-source",
    );
  });

  it("admits a Squid source chain only while a top-up is in progress", () => {
    // Every console route derives its network from the wallet chain, and an
    // unrecognized chain falls back to the default. Admitting a Squid chain
    // outside the top-up flow would serve the wrong network's data.
    expect(getConsoleDisplayAccessState("squid-source", false)).not.toBe("ready");
    expect(getConsoleDisplayAccessState("squid-source", true)).toBe("ready");
  });

  it("continues to reject unrelated unsupported chains", () => {
    expect(getConsoleAccessState({ accountState: "active", isConnected: true, hasAddress: true, chainId: 12345 })).toBe(
      "unsupported-chain",
    );
    expect(getConsoleDisplayAccessState("unsupported-chain", true)).toBe("unsupported-chain");
  });

  it("displays the console only for an active top-up on a recognized source chain", () => {
    expect(getConsoleDisplayAccessState("squid-source", false)).toBe("squid-source");
    expect(getConsoleDisplayAccessState("squid-source", true)).toBe("ready");
  });

  it("shows the actual source wallet network only while the top-up is active", () => {
    const activeMarkup = renderToStaticMarkup(
      <ConsoleWalletControls accessState='squid-source' chainId={8453} isTopUpActive={true} />,
    );
    expect(activeMarkup).toContain("Wallet: Base");
    expect(activeMarkup).not.toContain("Unsupported Network");
    expect(activeMarkup).not.toContain("Filecoin balance");
    expect(activeMarkup).not.toContain("Filecoin network");

    const inactiveMarkup = renderToStaticMarkup(
      <ConsoleWalletControls accessState='squid-source' chainId={8453} isTopUpActive={false} />,
    );
    expect(inactiveMarkup).toContain("Unsupported Network");
    expect(inactiveMarkup).not.toContain("Wallet: Base");
  });

  it("preserves page state while switching to and from a Squid source chain", () => {
    let increment = () => {};
    const StatefulPage = () => {
      const [count, setCount] = useState(0);
      increment = () => setCount((value) => value + 1);
      return <span>{count}</span>;
    };
    const content = (accessState: "ready" | "squid-source") => (
      <ConsoleContent accessState={accessState} sidebar={<aside>Navigation</aside>}>
        <StatefulPage />
      </ConsoleContent>
    );

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(content("ready"));
    });
    act(increment);
    act(() => {
      renderer.update(content("squid-source"));
    });
    expect(renderer.root.findByType("span").children).toEqual(["1"]);
    act(() => {
      renderer.update(content("ready"));
    });
    expect(renderer.root.findByType("span").children).toEqual(["1"]);
  });
});

// Privy's wagmi sync calls reconnect() whenever its user or wallet list changes, even when the
// selected wallet stays the same. That re-sync must not unmount the page the user is on.
describe("same-wallet re-sync", () => {
  const WALLET = "0x00000000000000000000000000000000000000aa";
  const OTHER = "0x00000000000000000000000000000000000000cc";
  const lastReady = { address: WALLET, chainId: 314 };

  it("stays ready when a reconnect keeps the last ready wallet and chain", () => {
    expect(keepReadyThroughResync("reconnecting", "active", lastReady, WALLET, 314)).toBe("ready");
  });

  it.each([
    ["nothing was ready before (first restore)", null, WALLET, 314],
    ["the chain changed", lastReady, WALLET, 314159],
    ["the account changed", lastReady, OTHER, 314],
    ["the chain is not known yet", lastReady, WALLET, undefined],
  ])("still shows reconnecting when %s", (_case, previous, address, chainId) => {
    expect(keepReadyThroughResync("reconnecting", "active", previous, address, chainId)).toBe("reconnecting");
  });

  // The console account changed, but Privy has not moved wagmi off the previous account yet.
  it("still shows reconnecting while wagmi holds an account other than the console account", () => {
    expect(keepReadyThroughResync("reconnecting", "connecting", lastReady, WALLET, 314)).toBe("reconnecting");
  });

  it("passes every other state through", () => {
    expect(keepReadyThroughResync("not-connected", "active", lastReady, WALLET, 314)).toBe("not-connected");
  });

  it("remembers the wallet and chain a ready console showed", () => {
    expect(rememberReadyConnection("ready", WALLET, 314, null)).toEqual({ address: WALLET, chainId: 314 });
  });

  it("keeps the remembered wallet through a reconnect", () => {
    expect(rememberReadyConnection("reconnecting", WALLET, 314, lastReady)).toBe(lastReady);
  });

  it.each(["not-connected", "unsupported-chain", "squid-source"] as const)(
    "forgets the remembered wallet on %s, so the next restore shows reconnecting",
    (state) => {
      expect(rememberReadyConnection(state, WALLET, 314, lastReady)).toBeNull();
    },
  );
});
