import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotConnected from "./NotConnected";

const mocks = vi.hoisted(() => ({
  isConnected: false,
  privy: { authenticated: false, error: null as Error | null, ready: false },
  walletsReady: false,
}));

vi.mock("@filecoin-foundation/ui-filecoin/EmptyStateCard", () => ({
  EmptyStateCard: ({
    children,
    description,
    title,
  }: {
    children: React.ReactNode;
    description: string;
    title: string;
  }) => (
    <div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/LoadingStateCard", () => ({
  LoadingStateCard: ({ message }: { message: string }) => <p>{message}</p>,
}));
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mocks.privy,
  useWallets: () => ({ ready: mocks.walletsReady }),
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ isConnected: mocks.isConnected }) }));
vi.mock("@/components/shared", () => ({ CustomConnectButton: () => <button type='button'>Wallet actions</button> }));

beforeEach(() => {
  mocks.isConnected = false;
  mocks.privy = { authenticated: false, error: null, ready: false };
  mocks.walletsReady = false;
});

describe("NotConnected", () => {
  it.each([
    ["Privy is loading", { authenticated: false, ready: false }, false, ["Loading wallet..."], []],
    [
      "the embedded wallet is preparing",
      { authenticated: true, ready: true },
      true,
      ["Preparing your wallet", "You&#x27;re signed in"],
      ["Access the Filecoin Pay console"],
    ],
    ["login is needed", { authenticated: false, ready: true }, true, ["Access the Filecoin Pay console"], []],
  ] as const)("shows the %s copy", (_label, privy, walletsReady, expected, unexpected) => {
    mocks.privy = { ...privy, error: null };
    mocks.walletsReady = walletsReady;

    const markup = renderToStaticMarkup(<NotConnected />);

    for (const copy of expected) expect(markup).toContain(copy);
    for (const copy of unexpected) expect(markup).not.toContain(copy);
  });
});
