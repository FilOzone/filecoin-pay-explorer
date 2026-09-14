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
  it("distinguishes Privy loading, embedded-wallet preparation, and login", () => {
    expect(renderToStaticMarkup(<NotConnected />)).toContain("Loading wallet...");

    mocks.privy = { authenticated: true, error: null, ready: true };
    mocks.walletsReady = true;
    const preparing = renderToStaticMarkup(<NotConnected />);
    expect(preparing).toContain("Preparing your wallet");
    expect(preparing).toContain("You&#x27;re signed in");
    expect(preparing).not.toContain("Access the Filecoin Pay console");

    mocks.privy = { authenticated: false, error: null, ready: true };
    expect(renderToStaticMarkup(<NotConnected />)).toContain("Access the Filecoin Pay console");
  });
});
