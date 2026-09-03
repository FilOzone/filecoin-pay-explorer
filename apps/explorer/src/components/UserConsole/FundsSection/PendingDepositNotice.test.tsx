import type { ReactNode } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPendingSquidDepositKey, PENDING_SQUID_DEPOSIT_EVENT } from "./data/squid-deposit-tracker";
import { PendingDepositNotice } from "./PendingDepositNotice";

const RECIPIENT = "0x2222222222222222222222222222222222222222";
const launch = vi.hoisted(() => ({ isUsdcFundingOpen: false, openUsdcFunding: vi.fn() }));

vi.mock("@/components/UserConsole/FundingLaunchContext", () => ({ useFundingLaunch: () => launch }));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({
    "aria-label": ariaLabel,
    children,
    onClick,
  }: {
    "aria-label"?: string;
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button aria-label={ariaLabel} onClick={onClick} type='button'>
      {children}
    </button>
  ),
}));

const items = new Map<string, string>();
const listeners: Record<string, (event?: unknown) => void> = {};

function seedPendingDeposit() {
  items.set(
    getPendingSquidDepositKey(RECIPIENT),
    JSON.stringify({
      recipient: RECIPIENT,
      owner: RECIPIENT,
      sourceChainId: 8453,
      quoteId: "quote-1",
      transactionHash: `0x${"a".repeat(64)}`,
      sourceAmount: "25000000",
      minimumDestinationAmount: "22000000000000000000",
      fundsBefore: "0",
      startedAt: 1,
      sourceSymbol: "USDC",
      sourceDecimals: 6,
    }),
  );
}

function render(address: string | undefined) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<PendingDepositNotice address={address as `0x${string}` | undefined} />);
  });
  return renderer;
}

beforeEach(() => {
  items.clear();
  launch.isUsdcFundingOpen = false;
  vi.stubGlobal("window", {
    addEventListener: vi.fn((type: string, listener: (event?: unknown) => void) => {
      listeners[type] = listener;
    }),
    dispatchEvent: vi.fn(),
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      removeItem: (key: string) => void items.delete(key),
      setItem: (key: string, value: string) => void items.set(key, value),
    },
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PendingDepositNotice", () => {
  it("names the in-flight deposit and opens the shared dialog from View", () => {
    seedPendingDeposit();
    const renderer = render(RECIPIENT);
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "25 USDC from Base is on its way to your Filecoin Pay account.",
    );

    act(() => renderer.root.findByProps({ "aria-label": "View USDC deposit in progress" }).props.onClick());
    expect(launch.openUsdcFunding).toHaveBeenCalledOnce();
  });

  it("hides while the dialog is open and disappears once the deposit clears", () => {
    seedPendingDeposit();
    launch.isUsdcFundingOpen = true;
    const renderer = render(RECIPIENT);
    expect(renderer.toJSON()).toBeNull();

    launch.isUsdcFundingOpen = false;
    act(() => renderer.update(<PendingDepositNotice address={RECIPIENT} />));
    expect(renderer.toJSON()).not.toBeNull();

    items.clear();
    act(() => listeners[PENDING_SQUID_DEPOSIT_EVENT]?.());
    expect(renderer.toJSON()).toBeNull();
  });

  it("renders nothing without an address or a pending deposit", () => {
    expect(render(RECIPIENT).toJSON()).toBeNull();
    seedPendingDeposit();
    expect(render(undefined).toJSON()).toBeNull();
  });
});
