import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConnectingWallet from "./ConnectingWallet";

const ACCOUNT = { address: "0x1111111111111111111111111111111111111111", walletClientType: "metamask" };

const mocks = vi.hoisted(() => ({
  account: null as null | { address: string; walletClientType: string },
  clearAccount: vi.fn(),
  logout: vi.fn<() => Promise<void>>(),
}));

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/EmptyStateCard", () => ({
  EmptyStateCard: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/LoadingStateCard", () => ({
  LoadingStateCard: ({ message }: { message: string }) => <p>{message}</p>,
}));
vi.mock("@privy-io/react-auth", () => ({
  useLogout: () => ({ logout: mocks.logout }),
  usePrivy: () => ({ authenticated: true }),
  useWallets: () => ({ wallets: [] }),
}));
vi.mock("@/components/UserConsole/providers/ConsoleAccountContext", () => ({
  useConsoleAccount: () => ({ account: mocks.account, clearAccount: mocks.clearAccount }),
}));

const render = () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<ConnectingWallet />);
  });
  return renderer;
};

const buttonLabels = (renderer: ReturnType<typeof create>) =>
  renderer.root.findAllByType("button").map((button) => button.children.join(""));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.account = ACCOUNT;
  mocks.logout.mockReset().mockResolvedValue(undefined);
  mocks.clearAccount.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("ConnectingWallet", () => {
  it("shows a plain loading card while connecting normally", () => {
    const renderer = render();

    expect(renderer.root.findByType("p").children).toEqual(["Connecting your wallet..."]);
    expect(buttonLabels(renderer)).toEqual([]);
  });

  it("offers reload and the session's exit once connecting takes too long", async () => {
    const renderer = render();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(renderer.root.findByType("h2").children).toEqual(["Still connecting your wallet"]);
    expect(buttonLabels(renderer)).toEqual(["Reload", "Log out"]);

    const logOut = renderer.root.findAllByType("button")[1];
    await act(async () => logOut.props.onClick());
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.clearAccount).toHaveBeenCalledOnce();
  });

  it("offers only reload when there is no account to leave", () => {
    mocks.account = null;
    const renderer = render();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(buttonLabels(renderer)).toEqual(["Reload"]);
  });
});
