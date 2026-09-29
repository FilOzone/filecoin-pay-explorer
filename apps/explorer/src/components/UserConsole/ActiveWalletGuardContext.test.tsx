import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveWalletGuardProvider, useActiveWalletGuard } from "./ActiveWalletGuardContext";

const wagmi = vi.hoisted(() => ({
  address: undefined as string | undefined,
  isConnected: false,
  disconnect: vi.fn(),
}));
const privy = vi.hoisted(() => ({
  authenticated: false,
  logout: vi.fn(async () => undefined),
}));
const sonner = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: wagmi.address, isConnected: wagmi.isConnected }),
  useDisconnect: () => ({ mutate: wagmi.disconnect }),
}));
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ authenticated: privy.authenticated }),
  useLogout: () => ({ logout: privy.logout }),
}));
vi.mock("sonner", () => ({ toast: { error: sonner.toastError } }));

const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";

let guard!: ReturnType<typeof useActiveWalletGuard>;
function Consumer() {
  guard = useActiveWalletGuard();
  return null;
}
const confirmActive = (address: string) => guard.confirmActive(address);

const render = () => (
  <ActiveWalletGuardProvider>
    <Consumer />
  </ActiveWalletGuardProvider>
);

describe("ActiveWalletGuardProvider", () => {
  beforeEach(() => {
    wagmi.address = undefined;
    wagmi.isConnected = false;
    wagmi.disconnect.mockReset();
    privy.authenticated = false;
    privy.logout.mockClear();
    sonner.toastError.mockClear();
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
    expect(sonner.toastError).not.toHaveBeenCalled();
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
    expect(sonner.toastError).toHaveBeenCalledWith("Wallet account changed", {
      description: "Your wallet switched accounts, so we ended the session. Log in again to continue.",
    });
  });

  it("ends the authenticated Privy session too, not just the wagmi connection, on unconfirmed drift", async () => {
    privy.authenticated = true;
    wagmi.address = ADDRESS_A;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(render());
    });

    wagmi.address = ADDRESS_B;
    await act(async () => renderer.update(render()));

    expect(privy.logout).toHaveBeenCalledOnce();
    expect(wagmi.disconnect).toHaveBeenCalledOnce();
  });

  it("marks the guard as exiting until the connection and Privy session both actually settle", async () => {
    privy.authenticated = true;
    wagmi.address = ADDRESS_A;
    wagmi.isConnected = true;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(render());
    });

    wagmi.address = ADDRESS_B;
    await act(async () => renderer.update(render()));
    expect(guard.isExiting).toBe(true);

    // wagmi settles first; Privy's logout hasn't resolved yet, so exiting must still hold.
    wagmi.isConnected = false;
    await act(async () => renderer.update(render()));
    expect(guard.isExiting).toBe(true);

    privy.authenticated = false;
    await act(async () => renderer.update(render()));
    expect(guard.isExiting).toBe(false);
  });

  it("stops exiting after a bounded wait if disconnect or logout never settles", async () => {
    vi.useFakeTimers();
    try {
      privy.authenticated = true;
      wagmi.address = ADDRESS_A;
      wagmi.isConnected = true;
      let renderer!: ReturnType<typeof create>;
      act(() => {
        renderer = create(render());
      });

      wagmi.address = ADDRESS_B;
      act(() => renderer.update(render()));
      expect(guard.isExiting).toBe(true);

      act(() => {
        vi.runAllTimers();
      });
      expect(guard.isExiting).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not call Privy logout for a connect-only session's unconfirmed drift", async () => {
    privy.authenticated = false;
    wagmi.address = ADDRESS_A;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(render());
    });

    wagmi.address = ADDRESS_B;
    await act(async () => renderer.update(render()));

    expect(privy.logout).not.toHaveBeenCalled();
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
