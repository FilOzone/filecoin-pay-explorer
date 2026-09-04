import { StrictMode } from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCardPurchase, waitForPurchasedUsdc } from "./useCardPurchase";

const ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const privy = vi.hoisted(() => ({
  authenticated: true,
  fund: vi.fn(),
  login: vi.fn(),
  onLoginComplete: undefined as (() => void) | undefined,
  onLoginError: undefined as (() => void) | undefined,
}));
const chain = vi.hoisted(() => ({ readContract: vi.fn() }));
const account = vi.hoisted(() => ({ address: "0x1111111111111111111111111111111111111111" }));
const queries = vi.hoisted(() => ({ invalidateQueries: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }));
const harness = { contextKey: `${ADDRESS}:314` };

vi.mock("@privy-io/react-auth", () => ({
  useFiatOnramp: () => ({ fund: privy.fund }),
  useLogin: ({ onComplete, onError }: { onComplete: () => void; onError: () => void }) => {
    privy.onLoginComplete = onComplete;
    privy.onLoginError = onError;
    return { login: privy.login };
  },
  usePrivy: () => ({ authenticated: privy.authenticated }),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => queries }));
vi.mock("wagmi", () => ({ usePublicClient: () => chain }));
vi.mock("wagmi/actions", () => ({ getAccount: () => account }));
vi.mock("@/services/wagmi/config", () => ({ config: {} }));
vi.mock("sonner", () => ({ toast }));

let latest!: ReturnType<typeof useCardPurchase>;
const onPurchased = vi.fn();
function Harness() {
  latest = useCardPurchase({ address: ADDRESS, contextKey: harness.contextKey, onPurchased });
  return null;
}

beforeEach(() => {
  account.address = ADDRESS;
  chain.readContract.mockReset();
  onPurchased.mockReset();
  privy.authenticated = true;
  privy.fund.mockReset();
  privy.login.mockReset();
  queries.invalidateQueries.mockReset();
  toast.error.mockReset();
  toast.info.mockReset();
  harness.contextKey = `${ADDRESS}:314`;
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("waitForPurchasedUsdc", () => {
  it("reports a verified balance increase, context drift, and delayed settlement", async () => {
    const wait = vi.fn(async () => undefined);
    await expect(
      waitForPurchasedUsdc({
        attempts: 2,
        before: 10n,
        isCurrent: () => true,
        read: vi.fn().mockResolvedValue(11n),
        wait,
      }),
    ).resolves.toEqual({ balance: 11n, status: "funded" });
    await expect(
      waitForPurchasedUsdc({ attempts: 2, before: 10n, isCurrent: () => false, read: vi.fn(), wait }),
    ).resolves.toEqual({ status: "changed" });
    await expect(
      waitForPurchasedUsdc({
        attempts: 2,
        before: 10n,
        isCurrent: () => true,
        read: vi.fn().mockResolvedValue(10n),
        wait,
      }),
    ).resolves.toEqual({ status: "delayed" });
    expect(wait).toHaveBeenCalledOnce();
  });
});

describe("useCardPurchase", () => {
  it("verifies landed Base USDC before resuming the Squid flow", async () => {
    chain.readContract.mockResolvedValueOnce(10n).mockResolvedValueOnce(25n);
    privy.fund.mockResolvedValue({ status: "confirmed" });
    await act(async () => {
      create(<Harness />);
    });

    await act(async () => latest.buyWithCard());

    expect(privy.fund).toHaveBeenCalledWith({
      destination: { address: ADDRESS, asset: BASE_USDC, chain: "eip155:8453" },
      environment: "production",
      source: {},
    });
    expect(queries.invalidateQueries).toHaveBeenCalled();
    expect(onPurchased).toHaveBeenCalledWith(15n);
  });

  it("still opens card funding after the Strict Mode effect probe", async () => {
    chain.readContract.mockResolvedValueOnce(10n).mockResolvedValueOnce(25n);
    privy.fund.mockResolvedValue({ status: "confirmed" });
    await act(async () => {
      create(
        <StrictMode>
          <Harness />
        </StrictMode>,
      );
    });

    await act(async () => latest.buyWithCard());

    expect(privy.fund).toHaveBeenCalledOnce();
    expect(onPurchased).toHaveBeenCalledWith(15n);
  });

  it("logs in first and continues only after authentication completes", async () => {
    privy.authenticated = false;
    chain.readContract.mockResolvedValueOnce(10n).mockResolvedValueOnce(12n);
    privy.fund.mockResolvedValue({ status: "submitted" });
    await act(async () => {
      create(<Harness />);
    });

    act(() => {
      void latest.buyWithCard();
    });
    expect(privy.login).toHaveBeenCalledOnce();
    expect(privy.fund).not.toHaveBeenCalled();
    await act(async () => {
      await privy.onLoginComplete?.();
    });
    expect(onPurchased).toHaveBeenCalledWith(2n);
  });

  it("does not continue login after the initiating network context changes", async () => {
    privy.authenticated = false;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Harness />);
    });

    act(() => {
      void latest.buyWithCard();
    });
    harness.contextKey = `${ADDRESS}:8453`;
    await act(async () => {
      renderer.update(<Harness />);
    });
    await act(async () => {
      await privy.onLoginComplete?.();
    });

    expect(privy.fund).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Wallet changed during login", expect.anything());
  });

  it("rechecks a delayed purchase without opening a second checkout", async () => {
    vi.useFakeTimers();
    chain.readContract.mockResolvedValue(10n);
    privy.fund.mockResolvedValue({ status: "submitted" });
    await act(async () => {
      create(<Harness />);
    });

    await act(async () => {
      const purchase = latest.buyWithCard();
      await vi.runAllTimersAsync();
      await purchase;
    });
    expect(privy.fund).toHaveBeenCalledOnce();
    expect(latest.label).toBe("Check for purchased USDC");

    chain.readContract.mockResolvedValue(25n);
    await act(async () => latest.buyWithCard());

    expect(privy.fund).toHaveBeenCalledOnce();
    expect(onPurchased).toHaveBeenCalledWith(15n);
  });

  it("does not resume a stale destination after the wallet changes", async () => {
    chain.readContract.mockResolvedValueOnce(10n);
    privy.fund.mockImplementation(async () => {
      account.address = OTHER;
      return { status: "confirmed" };
    });
    await act(async () => {
      create(<Harness />);
    });

    await act(async () => latest.buyWithCard());

    expect(onPurchased).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Wallet changed during card purchase", expect.anything());
  });

  it("keeps cancellation recoverable and reports provider failures", async () => {
    chain.readContract.mockResolvedValue(10n);
    await act(async () => {
      create(<Harness />);
    });

    privy.fund.mockRejectedValueOnce(new Error("User exited flow"));
    await act(async () => latest.buyWithCard());
    expect(toast.error).not.toHaveBeenCalled();

    privy.fund.mockRejectedValueOnce(new Error("Provider unavailable"));
    await act(async () => latest.buyWithCard());
    expect(toast.error).toHaveBeenCalledWith("Card purchase failed", { description: "Provider unavailable" });

    vi.mocked(toast.error).mockClear();
    privy.fund.mockRejectedValueOnce(undefined);
    await act(async () => latest.buyWithCard());
    expect(toast.error).toHaveBeenCalledWith("Card purchase failed", {
      description: "Privy card funding is unavailable.",
    });
  });
});
