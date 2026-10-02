import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountUnavailable from "./AccountUnavailable";

const ACCOUNT = { address: "0x1111111111111111111111111111111111111111", walletClientType: "metamask" };

const mocks = vi.hoisted(() => ({
  authenticated: false,
  clearAccount: vi.fn(),
  connectWallet: vi.fn(),
  logout: vi.fn<() => Promise<void>>(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
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
vi.mock("@privy-io/react-auth", () => ({
  useConnectWallet: () => ({ connectWallet: mocks.connectWallet }),
  useLogout: () => ({ logout: mocks.logout }),
  usePrivy: () => ({ authenticated: mocks.authenticated }),
}));
vi.mock("@/components/UserConsole/providers/ConsoleAccountContext", () => ({
  useConsoleAccount: () => ({
    account: ACCOUNT,
    clearAccount: mocks.clearAccount,
  }),
}));

const render = async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<AccountUnavailable />);
  });
  return renderer;
};

const clickButton = async (renderer: ReturnType<typeof create>, label: string) => {
  const button = renderer.root.findAllByType("button").find((candidate) => candidate.children.join("").includes(label));
  expect(button).toBeDefined();
  await act(async () => button?.props.onClick());
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = false;
  mocks.logout.mockResolvedValue(undefined);
});

describe("AccountUnavailable", () => {
  it("asks to unlock or reconnect when the extension exposes no account", async () => {
    const renderer = await render();

    expect(renderer.root.findByType("h2").children).toEqual(["Reconnect your wallet"]);
    await clickButton(renderer, "Reconnect wallet");
    expect(mocks.connectWallet).toHaveBeenCalledOnce();

    await clickButton(renderer, "Disconnect");
    expect(mocks.clearAccount).toHaveBeenCalledOnce();
  });
});
