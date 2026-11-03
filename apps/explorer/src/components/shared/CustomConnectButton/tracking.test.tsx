// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CustomConnectButton from ".";

type LoginComplete = (params: { isNewUser: boolean; wasAlreadyAuthenticated: boolean }) => void;
type ConnectSuccess = (params: { wallet: { address: string } }) => void;

const mocks = vi.hoisted(() => ({
  onLogin: undefined as LoginComplete | undefined,
  onConnect: undefined as ConnectSuccess | undefined,
  trackWalletConnected: vi.fn(),
  requestFundingAfterSignup: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
  useConnectWallet: ({ onSuccess }: { onSuccess: ConnectSuccess }) => {
    mocks.onConnect = onSuccess;
    return { connectWallet: vi.fn() };
  },
  useLogin: ({ onComplete }: { onComplete: LoginComplete }) => {
    mocks.onLogin = onComplete;
    return { login: vi.fn() };
  },
  usePrivy: () => ({ ready: true, authenticated: false, error: null }),
  useWallets: () => ({ ready: true, wallets: [] }),
}));
vi.mock("@/components/UserConsole/providers/ConsoleAccountContext", () => ({
  useConsoleAccount: () => ({ selectAccount: vi.fn() }),
}));
vi.mock("@/components/UserConsole/providers/FundingLaunchContext", () => ({
  useFundingLaunch: () => ({ requestFundingAfterSignup: mocks.requestFundingAfterSignup }),
}));
vi.mock("./useWalletExit", () => ({ useWalletExit: () => ({ exit: vi.fn() }) }));
vi.mock("@/utils/funnel-analytics", () => ({ trackWalletConnected: mocks.trackWalletConnected }));

afterEach(cleanup);

it("tracks a login or connect the user just made, not a restored session", () => {
  render(<CustomConnectButton />);
  act(() => mocks.onLogin?.({ isNewUser: true, wasAlreadyAuthenticated: false }));
  act(() => mocks.onLogin?.({ isNewUser: false, wasAlreadyAuthenticated: true }));
  act(() => mocks.onConnect?.({ wallet: { address: "0x1" } }));
  expect(mocks.trackWalletConnected.mock.calls).toEqual([["embedded", true], ["external"]]);
});

it("asks for Add funds after a login that created a new user, and only then", () => {
  render(<CustomConnectButton />);
  act(() => mocks.onLogin?.({ isNewUser: false, wasAlreadyAuthenticated: false }));
  act(() => mocks.onLogin?.({ isNewUser: true, wasAlreadyAuthenticated: true }));
  expect(mocks.requestFundingAfterSignup).not.toHaveBeenCalled();
  act(() => mocks.onLogin?.({ isNewUser: true, wasAlreadyAuthenticated: false }));
  expect(mocks.requestFundingAfterSignup).toHaveBeenCalledTimes(1);
});
