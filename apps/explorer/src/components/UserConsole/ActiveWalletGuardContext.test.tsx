import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveWalletGuardProvider, useActiveWalletGuard } from "./ActiveWalletGuardContext";

const wagmi = vi.hoisted(() => ({
  address: undefined as string | undefined,
  disconnect: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: wagmi.address }),
  useDisconnect: () => ({ mutate: wagmi.disconnect }),
}));

const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";

let confirmActive!: (address: string) => void;
function Consumer() {
  confirmActive = useActiveWalletGuard().confirmActive;
  return null;
}

const render = () => (
  <ActiveWalletGuardProvider>
    <Consumer />
  </ActiveWalletGuardProvider>
);

describe("ActiveWalletGuardProvider", () => {
  beforeEach(() => {
    wagmi.address = undefined;
    wagmi.disconnect.mockReset();
  });

  it("accepts the first address a page load connects to", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(render());
    });

    wagmi.address = ADDRESS_A;
    await act(async () => renderer.update(render()));

    expect(wagmi.disconnect).not.toHaveBeenCalled();
  });

  it("accepts a switch that was confirmed first", async () => {
    wagmi.address = ADDRESS_A;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(render());
    });

    act(() => confirmActive(ADDRESS_B));
    wagmi.address = ADDRESS_B;
    await act(async () => renderer.update(render()));

    expect(wagmi.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects an address change nobody confirmed", async () => {
    wagmi.address = ADDRESS_A;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(render());
    });

    wagmi.address = ADDRESS_B;
    await act(async () => renderer.update(render()));

    expect(wagmi.disconnect).toHaveBeenCalledOnce();
  });

  it("accepts a different wallet after a real disconnect, without treating it as unconfirmed drift", async () => {
    wagmi.address = ADDRESS_A;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(render());
    });

    wagmi.address = undefined;
    await act(async () => renderer.update(render()));

    wagmi.address = ADDRESS_B;
    await act(async () => renderer.update(render()));

    expect(wagmi.disconnect).not.toHaveBeenCalled();
  });

  it("accepts a fresh connect once wagmi reports disconnected again", async () => {
    wagmi.address = ADDRESS_A;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(render());
    });

    wagmi.address = ADDRESS_B;
    await act(async () => renderer.update(render()));
    expect(wagmi.disconnect).toHaveBeenCalledOnce();

    wagmi.address = undefined;
    await act(async () => renderer.update(render()));
    wagmi.address = ADDRESS_B;
    await act(async () => renderer.update(render()));

    expect(wagmi.disconnect).toHaveBeenCalledOnce();
  });
});
