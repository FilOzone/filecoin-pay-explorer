import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCardPurchase } from "./useCardPurchase";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const privy = vi.hoisted(() => ({
  authenticated: false,
  fund: vi.fn(async () => undefined),
  login: vi.fn(),
  onLoginComplete: undefined as (() => void) | undefined,
}));

vi.mock("@privy-io/react-auth", () => ({
  useFiatOnramp: () => ({ fund: privy.fund }),
  useLogin: ({ onComplete }: { onComplete: () => void }) => {
    privy.onLoginComplete = onComplete;
    return { login: privy.login };
  },
  usePrivy: () => ({ authenticated: privy.authenticated }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

let latest!: ReturnType<typeof useCardPurchase>;
const onPurchased = vi.fn();
function Harness() {
  latest = useCardPurchase({ address: ADDRESS, onPurchased });
  return null;
}

beforeEach(() => {
  privy.authenticated = false;
  privy.onLoginComplete = undefined;
});

describe("useCardPurchase", () => {
  it("asks a connect-only wallet to log in, then continues the purchase and reports it", async () => {
    await act(async () => {
      create(<Harness />);
    });
    expect(latest.label).toBe("Log in to buy with card");

    await act(async () => latest.buyWithCard());
    expect(privy.login).toHaveBeenCalledOnce();
    expect(privy.fund).not.toHaveBeenCalled();

    await act(async () => privy.onLoginComplete?.());
    expect(privy.fund).toHaveBeenCalledWith({
      source: {},
      destination: { address: ADDRESS, chain: "eip155:8453", asset: BASE_USDC },
      environment: "production",
    });
    expect(onPurchased).toHaveBeenCalledOnce();
  });

  it("buys directly once logged in and stays quiet when the user closes the modal", async () => {
    privy.authenticated = true;
    privy.fund.mockRejectedValueOnce(new Error("User exited flow"));
    await act(async () => {
      create(<Harness />);
    });
    expect(latest.label).toBe("Buy USDC with card");

    await act(async () => latest.buyWithCard());
    expect(privy.login).not.toHaveBeenCalled();
    expect(privy.fund).toHaveBeenCalledOnce();
    expect(onPurchased).not.toHaveBeenCalled();
  });
});
