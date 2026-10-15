import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UnsupportedChain from "./UnsupportedChain";

const mocks = vi.hoisted(() => ({
  exit: vi.fn<() => Promise<void>>(),
  switchChain: vi.fn<(args: { chainId: number }, options: { onError: (error: Error) => void }) => void>(),
  toastError: vi.fn(),
}));

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/EmptyStateCard", () => ({
  EmptyStateCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@phosphor-icons/react", () => ({ WarningCircleIcon: () => null }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("wagmi", () => ({ useSwitchChain: () => ({ switchChain: mocks.switchChain }) }));
vi.mock("@/components/shared/CustomConnectButton/useWalletExit", () => ({
  useConsoleAccountExit: () => ({ action: "disconnect", exit: mocks.exit }),
}));
vi.mock("@/services/wagmi/config", () => ({
  supportedChains: [
    { id: 314, label: "Filecoin Mainnet" },
    { id: 314159, label: "Filecoin Calibration" },
  ],
}));

const render = async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<UnsupportedChain />);
  });
  return renderer;
};

describe("UnsupportedChain", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers one switch action per supported network", async () => {
    const renderer = await render();
    const buttons = renderer.root.findAllByType("button");

    expect(buttons.map((button) => button.children.join(""))).toEqual([
      "Switch to Filecoin Mainnet",
      "Switch to Filecoin Calibration",
      "Disconnect",
    ]);
  });

  it("lets a wallet that cannot add Filecoin leave the console", async () => {
    mocks.exit.mockResolvedValue(undefined);
    const renderer = await render();
    const disconnect = renderer.root.findAllByType("button").at(-1);

    await act(async () => disconnect?.props.onClick());

    expect(mocks.exit).toHaveBeenCalledOnce();
  });

  it("switches to the chosen network and reports a rejected switch", async () => {
    const renderer = await render();
    const [, calibration] = renderer.root.findAllByType("button");

    act(() => calibration.props.onClick());
    expect(mocks.switchChain).toHaveBeenCalledWith({ chainId: 314159 }, { onError: expect.any(Function) });

    mocks.switchChain.mock.calls[0][1].onError(new Error("User rejected the request"));
    expect(mocks.toastError).toHaveBeenCalledWith("Unable to switch to Filecoin Calibration", {
      description: "User rejected the request",
    });
  });
});
