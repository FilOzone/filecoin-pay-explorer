// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SignInFundingPrompt } from "./SignInFundingPrompt";

const address = "0x1000000000000000000000000000000000000000";
const otherAddress = "0x2000000000000000000000000000000000000000";
const user = { id: "did:privy:first", linkedAccounts: [{ type: "wallet", address }] };

type LoginEvent = { user: { id: string }; loginAccount: { type: string }; wasAlreadyAuthenticated: boolean };
const mocks = vi.hoisted(() => ({
  login: undefined as ((event: LoginEvent) => void) | undefined,
  usePrivy: vi.fn(),
  read: vi.fn(),
  open: vi.fn(),
  dialogs: { isAddFundsOpen: false, isSquidOpen: false },
}));

vi.mock("@privy-io/react-auth", () => ({
  useLogin: ({ onComplete }: { onComplete: (event: LoginEvent) => void }) => {
    mocks.login = onComplete;
  },
  usePrivy: mocks.usePrivy,
}));
vi.mock("wagmi", () => ({ useReadContracts: mocks.read }));
vi.mock("./providers/FundingLaunchContext", () => ({
  useFundingLaunch: () => ({ ...mocks.dialogs, openAddFunds: mocks.open }),
}));

const balance = (fil = 0n, walletUsdfc = 0n, deposited = 0n) => ({
  data: [fil, walletUsdfc, [deposited, 0n, 0n, 0n]],
  isError: false,
  isFetchedAfterMount: true,
  isFetching: false,
});

function login(type = "email", restored = false) {
  act(() => mocks.login?.({ user, loginAccount: { type }, wasAlreadyAuthenticated: restored }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dialogs = { isAddFundsOpen: false, isSquidOpen: false };
  mocks.usePrivy.mockReturnValue({ user });
  mocks.read.mockReturnValue(balance());
});
afterEach(cleanup);

it.each(["email", "google_oauth"])("opens once after %s sign-in and a fresh check of the linked wallet", (type) => {
  const view = render(<SignInFundingPrompt />);
  login(type);
  expect(mocks.read).not.toHaveBeenCalled();
  view.rerender(<SignInFundingPrompt address={otherAddress} />);
  expect(mocks.read).not.toHaveBeenCalled();

  mocks.read.mockReturnValue({ ...balance(), isFetchedAfterMount: false });
  view.rerender(<SignInFundingPrompt address={address} />);
  expect(mocks.open).not.toHaveBeenCalled();
  mocks.read.mockReturnValue({ ...balance(), isFetching: true });
  view.rerender(<SignInFundingPrompt address={address} />);
  expect(mocks.open).not.toHaveBeenCalled();

  mocks.read.mockReturnValue(balance());
  view.rerender(<SignInFundingPrompt address={address} />);
  view.rerender(<SignInFundingPrompt address={address} />);
  expect(mocks.open).toHaveBeenCalledTimes(1);
});

it.each([
  ["native FIL", balance(1n)],
  ["wallet USDFC", balance(0n, 1n)],
  ["deposited USDFC", balance(0n, 0n, 1n)],
  ["an RPC error with cached zeros", { ...balance(), isError: true }],
])("skips the prompt when the read finds %s", (_, result) => {
  mocks.read.mockReturnValue(result);
  const view = render(<SignInFundingPrompt address={address} />);
  login();
  expect(mocks.read).toHaveBeenCalled();
  mocks.read.mockReturnValue(balance());
  view.rerender(<SignInFundingPrompt address={address} />);
  expect(mocks.open).not.toHaveBeenCalled();
});

it("ignores restored sessions, wallet logins and other users", () => {
  render(<SignInFundingPrompt address={address} />);
  login("email", true);
  login("wallet");
  mocks.usePrivy.mockReturnValue({ user: { ...user, id: "did:privy:other" } });
  login("email");
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.open).not.toHaveBeenCalled();
});

it.each(["isAddFundsOpen", "isSquidOpen"] as const)("drops the pending check when %s opens manually", (dialog) => {
  mocks.read.mockReturnValue({ ...balance(), isFetching: true });
  const view = render(<SignInFundingPrompt address={address} />);
  login();
  mocks.dialogs[dialog] = true;
  view.rerender(<SignInFundingPrompt address={address} />);
  mocks.dialogs[dialog] = false;
  mocks.read.mockReturnValue(balance());
  view.rerender(<SignInFundingPrompt address={address} />);
  expect(mocks.open).not.toHaveBeenCalled();
});

it.each([
  ["pointer press", (control: HTMLElement) => fireEvent.pointerDown(control)],
  ["keyboard activation", (control: HTMLElement) => fireEvent.keyDown(control, { key: "Enter" })],
  ["menu shortcut", (control: HTMLElement) => fireEvent.keyDown(control, { key: "ArrowDown" })],
  ["assistive click", (control: HTMLElement) => fireEvent.click(control)],
])("lets a %s on the wallet menu take precedence over a late empty balance", (_, activate) => {
  const page = () => (
    <>
      <button type='button' aria-haspopup='menu'>
        <span>Wallet menu</span>
      </button>
      <SignInFundingPrompt address={address} />
    </>
  );
  mocks.read.mockReturnValue({ ...balance(), isFetching: true });
  const view = render(page());
  login();
  activate(view.getByText("Wallet menu"));
  mocks.read.mockReturnValue(balance());
  view.rerender(page());
  expect(mocks.open).not.toHaveBeenCalled();
});

it("keeps the suggestion during background clicks and keyboard focus traversal", () => {
  const page = () => (
    <>
      <p>Dashboard</p>
      <button type='button'>Wallet menu</button>
      <SignInFundingPrompt address={address} />
    </>
  );
  mocks.read.mockReturnValue({ ...balance(), isFetching: true });
  const view = render(page());
  login();
  fireEvent.pointerDown(view.getByText("Dashboard"));
  fireEvent.keyDown(view.getByRole("button"), { key: "Tab" });
  mocks.read.mockReturnValue(balance());
  view.rerender(page());
  expect(mocks.open).toHaveBeenCalledOnce();
});
